/**
 * The Oracle Recruiting Cloud adapter (Oracle Fusion "Candidate Experience").
 *
 * Verified live on 2 Oct 2026 against two allowlisted employers:
 *   Penfolds / TWE   ebpm.fa.us2.oraclecloud.com, site CX_1     -- 64 listed, 19 in Australia
 *   Ipsos            ecqf.fa.em2.oraclecloud.com, site CX_2001  -- 173 listed, 4 in Australia
 * (Ipsos Australia is NOT on Pinpoint, whatever the PRD noted:
 * ipsos.pinpointhq.com is Ipsos UK.)
 *
 * These are the same requests the employer's own careers site makes,
 * unauthenticated -- the same footing as Workday's CXS endpoints. Oracle
 * restricts a *different* endpoint (recruitingJobSitePostedJobs, the
 * syndication feed for third-party job boards) to Marketplace partners;
 * this adapter doesn't use it. Neither host serves a robots.txt (404), so
 * the consent check finds no restriction.
 *
 * `sources.endpoint` is the public careers site:
 *   https://<host>/hcmUI/CandidateExperience/en/sites/<siteNumber>
 * Host and site number are read from it; the same URL + `/job/<Id>` is the
 * apply link, so every job links to the employer's own posting.
 *
 * List: GET .../recruitingCEJobRequisitions, 25 a page. `expand=requisitionList`
 * is required -- without it the response carries no requisitions at all.
 * Both tenants are global, so rows are kept by `PrimaryLocationCountry`
 * (`config.country`, default AU) before the detail request:
 * GET .../recruitingCEJobRequisitionDetails for the description and end date.
 */

import { fetchPublicUrl } from '../../ssrf'
import type { Adapter, RawPosting, SourceRow } from './types'

const REQUEST_HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; MMSSJobBoard/1.0)' }
const REQUEST_TIMEOUT_MS = 20_000
const PAGE_SIZE = 25
/** A hard stop if a tenant's count is wrong: 40 pages is 1,000 requisitions. */
const MAX_PAGES = 40

export interface OracleSite {
  origin: string
  siteNumber: string
  siteUrl: string
}

/** Host and site number from `https://<host>/hcmUI/CandidateExperience/<lang>/sites/<site>`. */
export function oracleSite(source: SourceRow): OracleSite {
  const url = new URL(source.endpoint)
  const match = /\/hcmUI\/CandidateExperience\/[^/]+\/sites\/([^/]+)/.exec(url.pathname)
  if (!match) {
    throw new Error(`Source "${source.slug}" needs an Oracle careers-site endpoint (.../CandidateExperience/<lang>/sites/<site>)`)
  }
  return { origin: url.origin, siteNumber: match[1], siteUrl: `${url.origin}${match[0]}` }
}

interface OracleListRow {
  Id: string
  Title: string
  PrimaryLocation: string | null
  PrimaryLocationCountry: string | null
  PostedDate: string | null
  ShortDescriptionStr?: string | null
  JobSchedule?: string | null
}

interface OracleListResponse {
  items?: Array<{ TotalJobsCount?: number; requisitionList?: OracleListRow[] }>
}

export interface OracleDetail {
  ExternalDescriptionStr?: string | null
  ExternalResponsibilitiesStr?: string | null
  ExternalQualificationsStr?: string | null
  ExternalPostedEndDate?: string | null
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

export const oracleAdapter: Adapter = {
  kind: 'ats',

  async fetch(source: SourceRow): Promise<RawPosting[]> {
    const site = oracleSite(source)
    const country = typeof source.config.country === 'string' ? source.config.country.toUpperCase() : 'AU'
    const api = `${site.origin}/hcmRestApi/resources/latest`

    const kept: OracleListRow[] = []
    for (let page = 0; page < MAX_PAGES; page++) {
      const offset = page * PAGE_SIZE
      const finder = `findReqs;siteNumber=${site.siteNumber},limit=${PAGE_SIZE},offset=${offset},sortBy=POSTING_DATES_DESC`
      const body = await getJson<OracleListResponse>(
        `${api}/recruitingCEJobRequisitions?onlyData=true&expand=requisitionList&finder=${finder}`
      )
      const item = body?.items?.[0]
      if (!item || !Array.isArray(item.requisitionList)) {
        throw new Error(`Oracle requisition list failed for ${source.slug} at offset ${offset}`)
      }
      for (const row of item.requisitionList) {
        if (row?.Id && row.Title && row.PrimaryLocationCountry?.toUpperCase() === country) kept.push(row)
      }
      const total = typeof item.TotalJobsCount === 'number' ? item.TotalJobsCount : 0
      if (item.requisitionList.length === 0 || offset + PAGE_SIZE >= total) break
    }

    const postings: RawPosting[] = []
    for (const row of kept) {
      const detailBody = await getJson<{ items?: OracleDetail[] }>(
        `${api}/recruitingCEJobRequisitionDetails?expand=all&onlyData=true&finder=ById;Id=%22${encodeURIComponent(row.Id)}%22,siteNumber=${site.siteNumber}`
      )
      // A failed detail call drops just this posting; the run's `seen`
      // count then reads low against usual_count instead of looking whole.
      const detail = detailBody?.items?.[0]
      if (!detail) continue

      const read = new Set(['title', 'company', 'applyUrl'])
      if (row.PrimaryLocation) read.add('location')
      if (detail.ExternalDescriptionStr) read.add('description')
      if (detail.ExternalPostedEndDate) read.add('closing_at')

      postings.push({
        sourceJobId: String(row.Id),
        applyUrl: `${site.siteUrl}/job/${encodeURIComponent(row.Id)}`,
        title: row.Title,
        company: source.name,
        raw: { ...row, detail } as unknown as Record<string, unknown>,
        read,
      })
    }
    return postings
  },
}
