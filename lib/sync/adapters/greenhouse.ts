/**
 * The Greenhouse job board adapter.
 *
 * Verified against the real API on 30 Sep 2026 (boards-api.greenhouse.io,
 * board "ogilvyaus" -- 7 live postings, unauthenticated GET). The fixture
 * __fixtures__/greenhouse-list.json is two postings trimmed from that call.
 *
 * One request per source, unlike Workday: `GET <endpoint>/jobs?content=true`
 * returns every posting WITH its description. There is no pagination on the
 * public board API -- `meta.total` equals the array length -- so there is
 * nothing to loop over and no N+1.
 *
 * `sources.endpoint` is the board's API base, e.g.
 * `https://boards-api.greenhouse.io/v1/boards/ogilvyaus`. The board token is
 * the last path segment of the employer's public board URL
 * (job-boards.greenhouse.io/<token>).
 *
 * What the response does and doesn't carry (see normaliseGreenhousePosting):
 * `content` is double-escaped HTML, `application_deadline` is a field but
 * null on every Ogilvy posting, and there is no employment type. So most
 * Greenhouse jobs will be held for `missing_closing_date` /
 * `missing_job_type` -- correct under the PRD, which holds anything
 * incompletely filled.
 */

import { fetchPublicUrl } from '../../ssrf'
import type { Adapter, RawPosting, SourceRow } from './types'

/**
 * `config.location_filter`: a case-insensitive pattern a posting's location
 * must match. A board can be global -- IPG Mediabrands' (Kinesso) lists 216
 * roles across Europe and the Americas, and the targeting gates only know a
 * short list of overseas places, so 19 of them reached review as "unsure".
 * Null when unset; throws on an invalid pattern rather than reading everything.
 */
export function locationFilter(source: SourceRow): RegExp | null {
  const raw = source.config.location_filter
  if (raw === undefined || raw === null) return null
  if (typeof raw !== 'string' || !raw) {
    throw new Error(`Source "${source.slug}" has a malformed config.location_filter: ${JSON.stringify(raw)}`)
  }
  try {
    return new RegExp(raw, 'i')
  } catch {
    throw new Error(`Source "${source.slug}" has an invalid config.location_filter pattern: ${raw}`)
  }
}

const REQUEST_HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; MMSSJobBoard/1.0)' }
const REQUEST_TIMEOUT_MS = 15_000

interface GreenhouseListPosting {
  id: number
  title: string
  absolute_url: string
  location: { name: string | null } | null
  content: string | null
  application_deadline: string | null
}

interface GreenhouseListResponse {
  jobs: GreenhouseListPosting[]
}

export const greenhouseAdapter: Adapter = {
  kind: 'ats',

  async fetch(source: SourceRow): Promise<RawPosting[]> {
    const url = new URL(`${source.endpoint.replace(/\/$/, '')}/jobs`)
    url.searchParams.set('content', 'true')

    const res = await fetchPublicUrl(url, { timeoutMs: REQUEST_TIMEOUT_MS, headers: REQUEST_HEADERS })
    // A wrong board token is a 404 with a JSON body; like Workday's 400, a
    // non-2xx body is never read as postings. Throwing records the run as
    // failed, rather than as a quiet zero that looks like an empty board.
    if (!res || !res.ok) {
      throw new Error(`Greenhouse board request failed for ${source.slug} (HTTP ${res?.status ?? 'no response'})`)
    }
    let body: GreenhouseListResponse
    try {
      body = (await res.json()) as GreenhouseListResponse
    } catch {
      throw new Error(`Greenhouse board for ${source.slug} did not return JSON`)
    }
    if (!Array.isArray(body?.jobs)) throw new Error(`Greenhouse board for ${source.slug} returned no jobs array`)

    const postings: RawPosting[] = []
    const where = locationFilter(source)
    for (const job of body.jobs) {
      // Shape-checked per posting: one without a title or apply URL is
      // skipped, never allowed to fail the rest of the board.
      if (!job?.title || !job.absolute_url) continue
      if (where && !where.test(job.location?.name ?? '')) continue

      const read = new Set(['title', 'company', 'applyUrl'])
      if (job.location?.name) read.add('location')
      if (job.content) read.add('description')
      if (job.application_deadline) read.add('closing_at')

      postings.push({
        sourceJobId: String(job.id),
        applyUrl: job.absolute_url,
        title: job.title,
        // `company_name` is the board owner's display name ("Ogilvy
        // Australia"); sources.name keeps one spelling per employer across
        // vendors, the same choice the Workday adapter makes.
        company: source.name,
        raw: job as unknown as Record<string, unknown>,
        read,
      })
    }
    return postings
  },
}
