/**
 * Rows for the temporary /admin/logos page: the 57 allowlisted employers plus
 * every other company with a job on the board, one row per company as
 * comparableName folds it.
 */

import { comparableName, normaliseDomain, parseBrandfetchInput } from './logos'

export interface ReviewEmployer {
  name: string
  group: string
  domain: string | null
}

export interface ReviewJob {
  company: string
  company_logo_url: string | null
  is_active: boolean
}

export interface ReviewApproved {
  company_key: string
  company: string
  domain: string | null
  logo_url: string
  approved_at: string
}

export interface LogoReviewRow {
  key: string
  company: string
  /** PRD group, or BOARD_ONLY_GROUP for a company that is only on the board. */
  group: string
  onAllowlist: boolean
  /** A domain to suggest first: the employer list's, else one read off a Brandfetch logo already on its jobs. */
  suggestedDomain: string | null
  /** The logo its jobs show today (most common non-empty one), so a good one can be kept with one click. */
  currentLogo: string | null
  jobCount: number
  activeJobCount: number
  approved: { logoUrl: string; domain: string | null; approvedAt: string } | null
}

export const BOARD_ONLY_GROUP = 'On the board, not on the scraping list'

function mostCommon(values: string[]): string | null {
  const counts = new Map<string, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  let best: string | null = null
  let bestCount = 0
  for (const [v, n] of counts) {
    if (n > bestCount) {
      best = v
      bestCount = n
    }
  }
  return best
}

export function buildLogoReviewRows(
  employers: ReviewEmployer[],
  jobs: ReviewJob[],
  approved: ReviewApproved[]
): LogoReviewRow[] {
  const rows = new Map<string, LogoReviewRow>()

  for (const e of employers) {
    const key = comparableName(e.name)
    if (!key || rows.has(key)) continue
    rows.set(key, {
      key,
      company: e.name,
      group: e.group,
      onAllowlist: true,
      suggestedDomain: normaliseDomain(e.domain),
      currentLogo: null,
      jobCount: 0,
      activeJobCount: 0,
      approved: null,
    })
  }

  const logosByKey = new Map<string, string[]>()
  for (const j of jobs) {
    const key = comparableName(j.company)
    if (!key) continue
    let row = rows.get(key)
    if (!row) {
      row = {
        key,
        company: j.company.trim(),
        group: BOARD_ONLY_GROUP,
        onAllowlist: false,
        suggestedDomain: null,
        currentLogo: null,
        jobCount: 0,
        activeJobCount: 0,
        approved: null,
      }
      rows.set(key, row)
    }
    row.jobCount++
    if (j.is_active) row.activeJobCount++
    const logo = j.company_logo_url?.trim()
    if (logo) logosByKey.set(key, [...(logosByKey.get(key) ?? []), logo])
  }

  for (const [key, logos] of logosByKey) {
    const row = rows.get(key)!
    row.currentLogo = mostCommon(logos)
    if (!row.suggestedDomain) {
      const brandfetchDomain = logos.map((l) => parseBrandfetchInput(l)?.domain).find(Boolean)
      row.suggestedDomain = brandfetchDomain ?? null
    }
  }

  for (const a of approved) {
    const row = rows.get(a.company_key)
    const value = { logoUrl: a.logo_url, domain: a.domain, approvedAt: a.approved_at }
    if (row) row.approved = value
    else
      rows.set(a.company_key, {
        key: a.company_key,
        company: a.company,
        group: BOARD_ONLY_GROUP,
        onAllowlist: false,
        suggestedDomain: a.domain,
        currentLogo: null,
        jobCount: 0,
        activeJobCount: 0,
        approved: value,
      })
  }

  // Allowlist first in its PRD order, then board-only companies by name.
  const all = [...rows.values()]
  return [
    ...all.filter((r) => r.onAllowlist),
    ...all.filter((r) => !r.onAllowlist).sort((a, b) => a.company.localeCompare(b.company)),
  ]
}
