/**
 * The SmartRecruiters adapter: the public Posting API.
 *
 * Verified live on 2 Oct 2026 against KPMG Australia (`KPMGAustralia1`, 113
 * postings) and Luxury Escapes (`LuxuryEscapes`, 20). List:
 * `GET <endpoint>/postings?limit=100&offset=N` -- each row carries location,
 * function, experienceLevel and typeOfEmployment. Detail: the row's `ref` --
 * the job ad's HTML sections and `postingUrl`, the job's page on the
 * employer's SmartRecruiters careers site, which is the apply link.
 *
 * Consent. api.smartrecruiters.com's robots.txt disallows every crawler
 * except LinkedInBot, so these sources are read only on the employer's
 * explicit approval, recorded as `config.consent` (the employers on the
 * allowlist gave it on 2 Oct 2026). Without it the consent check fails the
 * run, which is the point.
 *
 * `sources.endpoint` is `https://api.smartrecruiters.com/v1/companies/<id>`.
 * Rows are kept before any detail request by:
 *   - `config.country` (default `au`) -- Luxury Escapes also hires in London
 *   - `config.experience_levels`, an allow-list of experienceLevel ids --
 *     KPMG's 113 are mostly mid-senior and director roles
 *   - `config.title_filter`, as for Workday and Oracle
 */

import { fetchPublicUrl } from '../../ssrf'
import type { Adapter, RawPosting, SourceRow } from './types'
import { titleFilter } from './workday'

const REQUEST_HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; MMSSJobBoard/1.0)' }
const REQUEST_TIMEOUT_MS = 20_000
const PAGE_SIZE = 100
const MAX_PAGES = 20

interface LabelledId {
  id?: string
  label?: string
}

export interface SmartRecruitersListRow {
  id: string
  name: string
  ref: string
  releasedDate?: string | null
  location?: { city?: string; region?: string; country?: string; fullLocation?: string; remote?: boolean } | null
  experienceLevel?: LabelledId | null
  function?: LabelledId | null
  typeOfEmployment?: LabelledId | null
}

export interface SmartRecruitersDetail {
  postingUrl?: string
  jobAd?: { sections?: Record<string, { title?: string; text?: string } | undefined> }
}

async function getJson<T>(url: string): Promise<T | null> {
  const res = await fetchPublicUrl(new URL(url), { timeoutMs: REQUEST_TIMEOUT_MS, headers: REQUEST_HEADERS })
  if (!res || !res.ok) return null
  try {
    return (await res.json()) as T
  } catch {
    return null
  }
}

/** `config.experience_levels` as a set of ids, or null when unset. Throws on a malformed value. */
export function experienceLevels(source: SourceRow): Set<string> | null {
  const raw = source.config.experience_levels
  if (raw === undefined || raw === null) return null
  if (!Array.isArray(raw) || raw.some((v) => typeof v !== 'string')) {
    throw new Error(`Source "${source.slug}" has a malformed config.experience_levels: ${JSON.stringify(raw)}`)
  }
  return new Set(raw as string[])
}

export const smartRecruitersAdapter: Adapter = {
  kind: 'ats',

  async fetch(source: SourceRow): Promise<RawPosting[]> {
    const base = source.endpoint.replace(/\/$/, '')
    const country = typeof source.config.country === 'string' ? source.config.country.toLowerCase() : 'au'
    const levels = experienceLevels(source)
    const filter = titleFilter(source)

    const kept: SmartRecruitersListRow[] = []
    for (let page = 0; page < MAX_PAGES; page++) {
      const offset = page * PAGE_SIZE
      const body = await getJson<{ totalFound?: number; content?: SmartRecruitersListRow[] }>(
        `${base}/postings?limit=${PAGE_SIZE}&offset=${offset}`
      )
      if (!body || !Array.isArray(body.content)) {
        throw new Error(`SmartRecruiters postings request failed for ${source.slug} at offset ${offset}`)
      }
      for (const row of body.content) {
        if (!row?.id || !row.name || !row.ref) continue
        if ((row.location?.country ?? '').toLowerCase() !== country) continue
        if (levels && !levels.has(row.experienceLevel?.id ?? '')) continue
        if (filter && !filter.test(row.name)) continue
        kept.push(row)
      }
      const total = typeof body.totalFound === 'number' ? body.totalFound : 0
      if (body.content.length === 0 || offset + PAGE_SIZE >= total) break
    }

    const postings: RawPosting[] = []
    for (const row of kept) {
      // `ref` is the API's own detail URL; only follow it on the API host.
      let refUrl: URL
      try {
        refUrl = new URL(row.ref)
      } catch {
        continue
      }
      if (refUrl.host !== new URL(base).host) continue
      const detail = await getJson<SmartRecruitersDetail>(refUrl.toString())
      if (!detail?.postingUrl) continue // a failed detail drops just this posting

      const read = new Set(['title', 'company', 'applyUrl'])
      if (row.location?.city) read.add('location')
      if (detail.jobAd?.sections) read.add('description')
      if (row.typeOfEmployment?.label) read.add('job_type')

      postings.push({
        sourceJobId: row.id,
        applyUrl: detail.postingUrl,
        title: row.name,
        company: source.name,
        raw: { ...row, detail } as unknown as Record<string, unknown>,
        read,
      })
    }
    return postings
  },
}
