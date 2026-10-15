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

/**
 * Where an employer's own logo may be copied from without anyone approving
 * it: LinkedIn's company-logo images, which are the employer's own upload.
 * Nothing is guessed from a name -- the image comes with the job record.
 */
const ADOPTABLE_LOGO_HOSTS = new Set(['media.licdn.com'])
/** Mirrors the company-logos bucket (0014): raster only, 2MB. */
const ADOPT_MIME_TO_EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }
const ADOPT_MAX_BYTES = 2 * 1024 * 1024
/** Smaller than any real logo: an error page or a 1px placeholder. */
const ADOPT_MIN_BYTES = 200
const ADOPT_TIMEOUT_MS = 15_000

/**
 * The record's logo, when it is one we may copy and it belongs to `company`.
 * `postedCompany` is the employer the record names; when the board shows
 * someone else (Hatch posting for Deloitte) the image is the poster's logo,
 * not the employer's, so it is refused.
 */
export function adoptableLogo(imageUrl: unknown, postedCompany: unknown, company: string): string | null {
  if (typeof imageUrl !== 'string' || typeof postedCompany !== 'string') return null
  const key = comparableName(company)
  if (!key || comparableName(postedCompany) !== key) return null
  try {
    const url = new URL(imageUrl)
    return url.protocol === 'https:' && ADOPTABLE_LOGO_HOSTS.has(url.hostname.toLowerCase()) ? url.toString() : null
  } catch {
    return null
  }
}

/**
 * Give a company with no logo the one its job record came with: copy the
 * image into the company-logos bucket (LinkedIn's links are signed and can be
 * withdrawn, ours can't) and save it as the company's logo, so every later
 * job from them has it too. An admin can still replace it on /admin/logos,
 * and an existing row -- an admin's choice -- is never overwritten.
 *
 * Returns the company's logo afterwards, or null if the copy failed; a
 * failure only means the job is held for review, as before.
 */
export async function adoptCompanyLogo(
  db: SupabaseClient,
  company: string,
  imageUrl: string,
  fetchImpl: typeof fetch = (...args) => globalThis.fetch(...args)
): Promise<string | null> {
  const key = comparableName(company)
  if (!key) return null
  try {
    const res = await fetchImpl(imageUrl, { redirect: 'error', signal: AbortSignal.timeout(ADOPT_TIMEOUT_MS) })
    if (!res.ok) return null
    const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    const ext = ADOPT_MIME_TO_EXT[type]
    if (!ext) return null
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (bytes.byteLength < ADOPT_MIN_BYTES || bytes.byteLength > ADOPT_MAX_BYTES) return null

    // Named by content, so a re-run or a second job from the same company reuses the file.
    const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes))
    const hash = Array.from(digest.slice(0, 12), (b) => b.toString(16).padStart(2, '0')).join('')
    const path = `auto/${hash}.${ext}`
    const bucket = db.storage.from('company-logos')
    const { error: uploadError } = await bucket.upload(path, bytes, { contentType: type, upsert: true })
    if (uploadError) return null

    const { error } = await db.from('company_logos').upsert(
      { company_key: key, company: company.trim(), domain: null, logo_url: bucket.getPublicUrl(path).data.publicUrl, approved_by: null },
      { onConflict: 'company_key', ignoreDuplicates: true }
    )
    if (error) return null
    return await approvedLogoFor(db, company)
  } catch {
    return null
  }
}
