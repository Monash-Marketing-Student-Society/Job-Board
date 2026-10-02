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
 * Location facets, for global tenants. An early-careers tenant like
 * Unilever's is small enough to read whole, but P&G's and Mars's are ~800
 * postings each -- 800 detail calls a night for a handful of Australian jobs.
 * `config.location_facet = { parameter, prefix }` narrows the list server-side:
 * the facet ids are opaque per-tenant GUIDs, so instead of storing them the
 * adapter reads the first page's `facets` block and selects every value of
 * `parameter` whose descriptor starts with `prefix`. Verified 30 Sep 2026:
 *   P&G   pg.wd5 / 1000        { parameter: 'locationCountry', prefix: 'Australia' }  -> 5
 *   Mars  mars.wd3 / External  { parameter: 'locations',       prefix: 'AUS-' }       -> 12
 * Resolving at run time means a newly opened Australian office is included
 * without a config edit. City filtering stays with lib/sync/target.ts either
 * way; the facet only saves requests.
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
  /** Present on list responses; only the first page's is read. */
  facets?: WorkdayFacet[]
}

interface WorkdayFacetValue {
  descriptor: string
  id: string
}

/** A facet's values are either selectable values or, for a group, nested facets. */
export interface WorkdayFacet {
  facetParameter: string
  values: Array<WorkdayFacetValue | WorkdayFacet>
}

export interface LocationFacetConfig {
  parameter: string
  prefix: string
}

function isFacet(v: WorkdayFacetValue | WorkdayFacet): v is WorkdayFacet {
  return typeof (v as WorkdayFacet).facetParameter === 'string' && Array.isArray((v as WorkdayFacet).values)
}

/**
 * The ids of every `parameter` value whose descriptor starts with `prefix`
 * (case-insensitive), searching nested facet groups. `null` when the tenant
 * has no facet by that name at all -- a config error, not an empty result.
 */
export function resolveFacetIds(facets: WorkdayFacet[], { parameter, prefix }: LocationFacetConfig): string[] | null {
  let found = false
  const ids: string[] = []
  const want = prefix.toLowerCase()
  const walk = (list: WorkdayFacet[]) => {
    for (const facet of list) {
      if (facet.facetParameter === parameter) {
        found = true
        for (const v of facet.values) {
          if (!isFacet(v) && v.descriptor?.toLowerCase().startsWith(want)) ids.push(v.id)
        }
      }
      walk(facet.values.filter(isFacet))
    }
  }
  walk(facets)
  return found ? ids : null
}

/**
 * `config.title_filter`: a case-insensitive pattern a listing's title must
 * match to be read at all. For big employers that hire across every function
 * (CommBank, Telstra, Accenture), it keeps branch, retail and IT roles out of
 * the review queue, and because it's checked on the list title it skips their
 * detail requests too. Null when unset; throws on an invalid pattern.
 */
export function titleFilter(source: SourceRow): RegExp | null {
  const raw = source.config.title_filter
  if (raw === undefined || raw === null) return null
  if (typeof raw !== 'string' || !raw) {
    throw new Error(`Source "${source.slug}" has a malformed config.title_filter: ${JSON.stringify(raw)}`)
  }
  try {
    return new RegExp(raw, 'i')
  } catch {
    throw new Error(`Source "${source.slug}" has an invalid config.title_filter pattern: ${raw}`)
  }
}

/** `config.location_facet`, or null when unset. Throws on a malformed value rather than ignoring it. */
export function locationFacetConfig(source: SourceRow): LocationFacetConfig | null {
  const raw = source.config.location_facet
  if (raw === undefined || raw === null) return null
  const c = raw as Partial<LocationFacetConfig>
  if (typeof c.parameter !== 'string' || !c.parameter || typeof c.prefix !== 'string' || !c.prefix) {
    throw new Error(`Source "${source.slug}" has a malformed config.location_facet: ${JSON.stringify(raw)}`)
  }
  return { parameter: c.parameter, prefix: c.prefix }
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

async function fetchList(
  endpoint: string,
  offset: number,
  appliedFacets: Record<string, string[]>
): Promise<WorkdayListResponse | null> {
  const page = await fetchJson<WorkdayListResponse>(`${endpoint}/jobs`, {
    method: 'POST',
    body: { appliedFacets, limit: PAGE_SIZE, offset, searchText: '' },
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
    let appliedFacets: Record<string, string[]> = {}
    const filter = titleFilter(source)
    // Workday reports `total` on the first page only; every later page says 0
    // (verified on CommBank, 2 Oct 2026). Trusting each page's own total
    // stopped every source at 40 postings.
    let total: number | null = null

    const facetConfig = locationFacetConfig(source)
    if (facetConfig) {
      // One unfiltered page, read only for its facets block.
      const probe = await fetchList(source.endpoint, 0, {})
      if (!probe) throw new Error(`Workday list request failed for ${source.slug} while reading facets`)
      const ids = resolveFacetIds(probe.facets ?? [], facetConfig)
      if (ids === null) {
        throw new Error(`Workday tenant for ${source.slug} has no "${facetConfig.parameter}" facet; check config.location_facet`)
      }
      // The parameter exists but nothing matches: no postings there right
      // now. Workday omits zero-count values, so this is a quiet week, not a
      // broken config -- the zero guard judges it against usual_count.
      if (ids.length === 0) return postings
      appliedFacets = { [facetConfig.parameter]: ids }
    }

    for (;;) {
      const page = await fetchList(source.endpoint, offset, appliedFacets)
      if (!page) throw new Error(`Workday list request failed for ${source.slug} at offset ${offset}`)

      if (total === null) total = page.total

      for (const listed of page.jobPostings) {
        if (filter && !filter.test(listed.title)) continue
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
      if (page.jobPostings.length === 0 || offset >= total) break
    }

    return postings
  },
}
