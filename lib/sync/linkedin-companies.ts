/**
 * LinkedIn employer sizes, for the Sydney and blue-collar size rules in target.ts.
 *
 * LinkedIn's job feed names the employer (company_id, company_url) but not
 * its size, so the LinkedIn run looks each new Sydney employer up once in
 * Bright Data's "LinkedIn companies -- collect by URL" dataset
 * (`gd_l1vikfnt1wgvvqz95w`) and caches the answer in `linkedin_companies`.
 * Lookups come out of the same 5,000-record monthly pool as the job
 * searches (Bright Data's free credits are shared across scrapers), so the
 * adapter counts them in the same ledger.
 *
 * The pure helpers here are what the adapter and the tests share; the
 * Supabase store is the CompanyStore the worker hands the adapter.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveCity } from './location'
import { isListEmployer } from './list-employers'
import { isSalesTitle } from './role-type'
import { isBlueCollarIndustry, isEntryRoute } from './target'
import type { CompanyRef, CompanySize, CompanyStore } from './adapters/types'

export const COMPANY_DATASET_ID = 'gd_l1vikfnt1wgvvqz95w'

/**
 * The company page a job record links to, in one canonical form so the
 * cache key and the lookup's answer match: "https://au.linkedin.com/company/
 * hatch-team?trk=..." -> "https://www.linkedin.com/company/hatch-team".
 * Schools ("/school/australianinstituteofcompanydirectors") keep their path.
 */
export function canonicalCompanyUrl(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    if (!/(^|\.)linkedin\.com$/i.test(parsed.hostname)) return null
    const match = parsed.pathname.match(/^\/(company|school|showcase)\/([^/]+)/i)
    if (!match) return null
    return `https://www.linkedin.com/${match[1].toLowerCase()}/${decodeURIComponent(match[2]).toLowerCase()}`
  } catch {
    return null
  }
}

/** The lower bound of a LinkedIn size band: "51-200 employees" -> 51, "10,001+ employees" -> 10001. */
export function employeesMin(companySize: string | null | undefined): number | null {
  const match = companySize?.replace(/,/g, '').match(/\d+/)
  return match ? Number(match[0]) : null
}

/** The employer a LinkedIn job record names, or null when it names none. */
export function companyRef(raw: Record<string, unknown>): CompanyRef | null {
  const companyId = raw.company_id
  const url = canonicalCompanyUrl(typeof raw.company_url === 'string' ? raw.company_url : null)
  if ((typeof companyId !== 'string' && typeof companyId !== 'number') || !url) return null
  return { companyId: String(companyId), url }
}

/** True for a job record placed in Sydney -- the only city the size rule applies to. */
export function isSydneyRecord(raw: Record<string, unknown>): boolean {
  return resolveCity(typeof raw.job_location === 'string' ? raw.job_location : null) === 'sydney'
}

/**
 * The jobs whose employer size a rule reads: a Sydney graduate program or
 * internship (every other Sydney job is removed whatever the size, so it
 * isn't worth a lookup); outside Sydney, a sales role that isn't a program
 * (kept only at an employer of 1,000+ that trains); and, in any city, a job
 * in a blue-collar industry (blocked only for employers under 1,000).
 */
export function needsEmployerSize(raw: Record<string, unknown>): boolean {
  const title = typeof raw.job_title === 'string' ? raw.job_title : ''
  const internship = typeof raw.job_employment_type === 'string' && /intern/i.test(raw.job_employment_type)
  // A listed employer keeps its Sydney roles whatever its size: no lookup needed.
  const listed = isListEmployer(typeof raw.company_name === 'string' ? raw.company_name : null)
  const entryRoute = isEntryRoute(title, internship ? 'internship' : null)
  const sydneyProgram = isSydneyRecord(raw) && !listed && entryRoute
  const salesRole = !isSydneyRecord(raw) && !listed && !entryRoute && isSalesTitle(title)
  return sydneyProgram || salesRole || isBlueCollarIndustry(typeof raw.job_industries === 'string' ? raw.job_industries : null)
}

export interface CompanyRecord {
  input?: { url?: string } | null
  url?: string | null
  name?: string | null
  company_size?: string | null
  employees_in_linkedin?: number | null
  error?: string
  error_code?: string
}

/**
 * The lookup's answers matched back to what was asked, by canonical URL. An
 * employer the lookup failed on is still saved, with no size, so it isn't
 * bought again every run; its jobs go to review.
 */
export function toCompanySizes(asked: CompanyRef[], records: CompanyRecord[]): CompanySize[] {
  const byUrl = new Map<string, CompanyRecord>()
  for (const record of records) {
    const url = canonicalCompanyUrl(record.input?.url ?? record.url ?? null)
    if (url && !(record.error || record.error_code)) byUrl.set(url, record)
  }
  return asked.map((ref) => {
    const record = byUrl.get(ref.url)
    const size = record?.company_size ?? null
    return {
      ...ref,
      name: record?.name ?? null,
      companySize: size,
      employeesMin: employeesMin(size),
      employeesOnLinkedIn: typeof record?.employees_in_linkedin === 'number' ? record.employees_in_linkedin : null,
    }
  })
}

export function companyStore(db: SupabaseClient): CompanyStore {
  return {
    async sizes(companyIds) {
      const sizes = new Map<string, number | null>()
      if (companyIds.length === 0) return sizes
      const { data, error } = await db
        .from('linkedin_companies')
        .select('company_id, employees_min')
        .in('company_id', [...new Set(companyIds)])
      if (error) throw new Error(`company sizes: ${error.message}`)
      for (const row of data ?? []) sizes.set(row.company_id as string, (row.employees_min as number | null) ?? null)
      return sizes
    },

    async save(rows) {
      if (rows.length === 0) return
      const { error } = await db.from('linkedin_companies').upsert(
        rows.map((r) => ({
          company_id: r.companyId,
          company_url: r.url,
          name: r.name,
          company_size: r.companySize,
          employees_min: r.employeesMin,
          employees_on_linkedin: r.employeesOnLinkedIn,
          fetched_at: new Date().toISOString(),
        })),
        { onConflict: 'company_id' }
      )
      if (error) throw new Error(`company save: ${error.message}`)
    },

    async pendingUnknown(limit) {
      const { data, error } = await db
        .from('staged_jobs')
        .select('raw, sources!inner(slug)')
        .eq('status', 'pending')
        .eq('sources.slug', 'linkedin')
      if (error) throw new Error(`pending companies: ${error.message}`)
      const refs = new Map<string, CompanyRef>()
      for (const row of data ?? []) {
        const raw = (row.raw ?? {}) as Record<string, unknown>
        const ref = needsEmployerSize(raw) ? companyRef(raw) : null
        if (ref) refs.set(ref.companyId, ref)
      }
      const known = await this.sizes([...refs.keys()])
      return [...refs.values()].filter((ref) => !known.has(ref.companyId)).slice(0, limit)
    },
  }
}
