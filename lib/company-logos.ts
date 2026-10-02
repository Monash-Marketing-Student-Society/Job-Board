/**
 * Approved company logos (company_logos, 0040): the /admin/logos approvals and
 * the lookup the sync uses to give a synced job its company's logo.
 *
 * Approving also rewrites company_logo_url on the company's existing jobs, live
 * or not. That is deliberate: the admin has just looked at the logo and said
 * "this one", and the old values are what the page exists to fix (expired
 * LinkedIn links, borrowed Brandfetch IDs, none at all).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { comparableName, parseLogoInput } from './logos'

export interface ApprovedLogo {
  company_key: string
  company: string
  domain: string | null
  logo_url: string
  approved_at: string
}

export type ApproveResult =
  | { ok: true; logo: ApprovedLogo; jobsUpdated: number }
  | { ok: false; kind: 'invalid'; message: string }
  | { ok: false; kind: 'error'; message: string }

/**
 * `link` is whatever the page sends: a suggested domain, a pasted Brandfetch
 * or image link, or an uploaded file's public URL. It goes through
 * parseLogoInput here, on the server, so a hand-made request can't store a
 * page URL or a link about to expire either.
 */
export async function approveCompanyLogo(
  db: SupabaseClient,
  input: { company: string; link: string },
  adminId: string | null
): Promise<ApproveResult> {
  const company = input.company.trim()
  const key = comparableName(company)
  if (!key) return { ok: false, kind: 'invalid', message: 'Company name is empty' }

  const result = parseLogoInput(input.link)
  if (!result.ok) return { ok: false, kind: 'invalid', message: result.reason }
  const parsed = result.logo

  const { data: logo, error } = await db
    .from('company_logos')
    .upsert(
      {
        company_key: key,
        company,
        domain: parsed.domain,
        logo_url: parsed.logoUrl,
        approved_by: adminId,
        approved_at: new Date().toISOString(),
      },
      { onConflict: 'company_key' }
    )
    .select('company_key, company, domain, logo_url, approved_at')
    .single()
  if (error || !logo) return { ok: false, kind: 'error', message: `save: ${error?.message ?? 'no row'}` }

  const ids = await jobIdsForCompany(db, key)
  if (ids === null) return { ok: false, kind: 'error', message: 'saved, but could not read jobs to update' }
  if (ids.length > 0) {
    const { error: jobsError } = await db.from('jobs').update({ company_logo_url: parsed.logoUrl }).in('id', ids)
    if (jobsError) return { ok: false, kind: 'error', message: `saved, but jobs not updated: ${jobsError.message}` }
  }

  return { ok: true, logo: logo as ApprovedLogo, jobsUpdated: ids.length }
}

/** Un-approve. Jobs keep the logo they have; only future synced jobs stop getting it. */
export async function removeCompanyLogo(db: SupabaseClient, company: string): Promise<{ ok: boolean; message?: string }> {
  const key = comparableName(company)
  if (!key) return { ok: false, message: 'Company name is empty' }
  const { error } = await db.from('company_logos').delete().eq('company_key', key)
  return error ? { ok: false, message: error.message } : { ok: true }
}

/**
 * Ids of every job whose company folds to `key`. Matched in code rather than
 * SQL so it is exactly comparableName's folding; the jobs table is small (tens
 * of rows, low thousands at the PRD's target), so reading company names is cheap.
 */
async function jobIdsForCompany(db: SupabaseClient, key: string): Promise<string[] | null> {
  const { data, error } = await db.from('jobs').select('id, company')
  if (error) return null
  return ((data ?? []) as { id: string; company: string }[])
    .filter((j) => comparableName(j.company) === key)
    .map((j) => j.id)
}

/** The approved logo for a company, or null. Used by the sync before its source-domain fallback. */
export async function approvedLogoFor(db: SupabaseClient, company: string): Promise<string | null> {
  const key = comparableName(company)
  if (!key) return null
  const { data } = await db.from('company_logos').select('logo_url').eq('company_key', key).maybeSingle()
  return (data?.logo_url as string | undefined) ?? null
}
