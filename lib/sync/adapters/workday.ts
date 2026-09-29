/**
 * The Workday ATS adapter.
 *
 * Verified against the real API on 23 Sep 2026 (unilever.wd3.myworkdayjobs.com,
 * tenant "unilever", site "Unilever_Early_Careers" -- 16 live postings,
 * unauthenticated). Fixtures in __fixtures__/workday-*.json are trimmed real
 * responses from that call, not invented shapes.
 *
 * Two requests per posting: the list endpoint (`sources.endpoint` + `/jobs`,
 * POST, paginated) gives title/location/a relative path per posting; the
 * detail endpoint (`sources.endpoint` + that path) gives everything else --
 * closing date, description, the real apply URL. Workday's list response
 * doesn't carry enough to skip the detail call (no closing date, no
 * description, no absolute URL), so this is N+1 by design, not an oversight.
 * Fine at this scale: a 16-posting tenant is 17 requests, and the worker has
 * no per-request time budget to protect (see the TDD's "Scheduling" section).
 *
 * `sources.endpoint` is the full CXS base URL including tenant and site,
 * e.g. `https://unilever.wd3.myworkdayjobs.com/wday/cxs/unilever/Unilever_Early_Careers`
 * -- the "wd3" data-centre number varies unpredictably per company and isn't
 * derivable from the tenant name, so it has to be configured, not guessed.
 *
 * Not attempted here: server-side location-facet filtering (Workday's list
 * endpoint accepts `appliedFacets`, and the TDD notes both Workday and
 * Greenhouse support it). The facet id scheme is per-tenant opaque GUIDs
 * (see the fixture's sibling `facets` block, trimmed out here) with no
 * documented way to derive "Melbourne" or "Sydney" from a tenant alone, so
 * this fetches every posting and leaves city filtering to lib/sync/target.ts,
 * which already has to run regardless. A correctness/efficiency split, not a
 * correctness gap -- worth revisiting once real facet ids are seen for a
 * specific tenant.
 */

import { fetchPublicUrl } from '../../ssrf'
import type { Adapter, RawPosting, SourceRow } from './types'

const REQUEST_HEADERS = {
  'Content-Type': 'application/json',
  'User-Agent': 'Mozilla/5.0 (compatible; MMSSJobBoard/1.0)',
}
const REQUEST_TIMEOUT_MS = 15_000
const PAGE_SIZE = 20

interface WorkdayListPosting {
  title: string
  externalPath: string
  locationsText: string
}

interface WorkdayListResponse {
  total: number
  jobPostings: WorkdayListPosting[]
}

interface WorkdayDetailResponse {
  jobPostingInfo: {
    title: string
    jobDescription: string | null
    location: string | null
    jobReqId: string | null
    externalUrl: string
    endDate: string | null
  }
}

/**
 * The two CXS endpoints take opposite methods -- verified against the real
 * API, 24 Sep 2026:
 *   list   (`/jobs`)          POST with a JSON body; a GET returns 400
 *   detail (`/job/<path>`)    GET;                   a POST returns 400
 *
 * A non-2xx response returns null even when its body parses: Workday's 400
 * carries a JSON error object ({"errorCode":"HTTP_400",...}), and treating
 * that as a successful payload is exactly what used to crash the adapter.
 */
async function fetchJson<T>(url: string, init: { method: 'GET' } | { method: 'POST'; body: unknown }): Promise<T | null> {
  const res = await fetchPublicUrl(new URL(url), {
    timeoutMs: REQUEST_TIMEOUT_MS,
    headers: REQUEST_HEADERS,
    method: init.method,
    body: init.method === 'POST' ? JSON.stringify(init.body) : undefined,
  })
  if (!res || !res.ok) return null
  try {
    return (await res.json()) as T
  } catch {
    return null
  }
}

async function fetchList(endpoint: string, offset: number): Promise<WorkdayListResponse | null> {
  const page = await fetchJson<WorkdayListResponse>(`${endpoint}/jobs`, {
    method: 'POST',
    body: { appliedFacets: {}, limit: PAGE_SIZE, offset, searchText: '' },
  })
  return page && Array.isArray(page.jobPostings) ? page : null
}

async function fetchDetail(endpoint: string, externalPath: string): Promise<WorkdayDetailResponse | null> {
  const detail = await fetchJson<WorkdayDetailResponse>(`${endpoint}${externalPath}`, { method: 'GET' })
  // Shape-checked, not just parse-checked: a posting with no jobPostingInfo
  // (or no apply URL) is skipped, never allowed to throw out of the adapter
  // and fail every other posting from the same source.
  return detail?.jobPostingInfo?.externalUrl ? detail : null
}

export const workdayAdapter: Adapter = {
  kind: 'ats',

  async fetch(source: SourceRow): Promise<RawPosting[]> {
    const postings: RawPosting[] = []
    let offset = 0

    for (;;) {
      const page = await fetchList(source.endpoint, offset)
      if (!page) throw new Error(`Workday list request failed for ${source.slug} at offset ${offset}`)

      for (const listed of page.jobPostings) {
        const detail = await fetchDetail(source.endpoint, listed.externalPath)
        if (!detail) {
          // One posting's detail call failing doesn't fail the whole source --
          // it's just missing from this run, the same as if the list hadn't
          // included it, and the run's `seen` count in sync_runs will read
          // low against usual_count rather than silently looking complete.
          continue
        }

        const info = detail.jobPostingInfo
        const read = new Set(['title', 'company', 'applyUrl'])
        if (info.location) read.add('location')
        if (info.endDate) read.add('closing_at')
        if (info.jobDescription) read.add('description')

        postings.push({
          sourceJobId: info.jobReqId,
          applyUrl: info.externalUrl,
          title: info.title,
          company: source.name, // Workday's hiringOrganization.name is reliably empty
          raw: detail as unknown as Record<string, unknown>,
          read,
        })
      }

      offset += PAGE_SIZE
      if (offset >= page.total) break
    }

    return postings
  },
}
