/**
 * Company logos (company_logos, 0040): one per company, looked up whenever a
 * job is published. Filled automatically -- the sync copies each employer's
 * own LinkedIn logo the first time it meets them (adoptCompanyLogo).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { comparableName } from './logos'

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
 * job from them has it too. An existing row is never overwritten.
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
