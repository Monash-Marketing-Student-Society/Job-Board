/**
 * "List your roles with MMSS": an employer's request to have their job
 * system read automatically, and an admin's approval turning it into a
 * source.
 *
 * The employer's ticked confirmation is the explicit consent the pre-run
 * check accepts (lib/sync/robots.ts), so an approved request becomes a
 * source carrying `config.consent.type = 'explicit'` -- read even if the
 * career site's robots.txt is restrictive, because the employer said so.
 *
 * Approval claims the row first (`UPDATE ... WHERE status = 'pending'`),
 * the same guard the staged routes use, then probes the feed live before
 * creating anything: a link that doesn't answer, or a whole global tenant
 * (hundreds of postings, which needs a location filter set up by hand), is
 * handed back to the queue rather than becoming a broken source.
 */

import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchPublicUrl } from '../ssrf'
import { slugify } from '../utils'
import type { DetectedAts } from './detect-ats'

export const sourceRequestSchema = z.object({
  company_name: z.string().trim().min(1).max(200),
  contact_name: z.string().trim().min(1).max(200),
  contact_email: z.string().trim().max(254).email(),
  careers_url: z
    .string()
    .trim()
    .max(2048)
    .url()
    .refine((u) => /^https?:\/\//i.test(u), 'Must be an http(s) URL'),
  // The whole point of the form: without it there is no consent to record.
  consent: z.literal(true),
})

export type SourceRequestInput = z.infer<typeof sourceRequestSchema>

/**
 * Past this, a feed is a whole global tenant (P&G and Mars are ~800 each)
 * and needs `config.location_facet` set up by hand, not one-click approval.
 */
export const MAX_AUTO_APPROVE_POSTINGS = 150

const PROBE_HEADERS = { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; MMSSJobBoard/1.0)' }

/** How many postings the feed lists right now: one request, never the N+1 detail calls a full run makes. */
export async function probeFeed(ats: DetectedAts): Promise<number> {
  if (ats.vendor === 'workday') {
    const res = await fetchPublicUrl(new URL(`${ats.endpoint}/jobs`), {
      timeoutMs: 15_000,
      headers: PROBE_HEADERS,
      method: 'POST',
      body: JSON.stringify({ appliedFacets: {}, limit: 1, offset: 0, searchText: '' }),
    })
    if (!res?.ok) throw new Error(`the Workday feed answered HTTP ${res?.status ?? 'no response'}`)
    const body = (await res.json().catch(() => null)) as { total?: unknown } | null
    if (typeof body?.total !== 'number') throw new Error('the Workday feed did not return a job count')
    return body.total
  }

  const res = await fetchPublicUrl(new URL(`${ats.endpoint}/jobs`), { timeoutMs: 15_000, headers: PROBE_HEADERS })
  if (!res?.ok) throw new Error(`the Greenhouse board answered HTTP ${res?.status ?? 'no response'}`)
  const body = (await res.json().catch(() => null)) as { jobs?: unknown } | null
  if (!Array.isArray(body?.jobs)) throw new Error('the Greenhouse board did not return a jobs list')
  return body.jobs.length
}

export type ApproveResult =
  /** `existing`: the feed was already a source, so the consent was recorded on it instead of creating a duplicate. */
  | { ok: true; sourceId: string; slug: string; postings: number; existing: boolean }
  | { ok: false; kind: 'conflict' }
  | { ok: false; kind: 'probe_failed' | 'too_large' | 'error'; message: string }

interface ClaimedRequest {
  id: string
  company_name: string
  contact_email: string
  detected_vendor: DetectedAts['vendor']
  detected_endpoint: string
}

/** A slug no other source uses: `acme`, then `acme-2`, `acme-3`... */
async function freeSlug(db: SupabaseClient, companyName: string): Promise<string> {
  const base = slugify(companyName) || 'employer'
  const { data } = await db.from('sources').select('slug').like('slug', `${base}%`)
  const taken = new Set((data ?? []).map((r: { slug: string }) => r.slug))
  if (!taken.has(base)) return base
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`
}

export async function approveSourceRequest(
  db: SupabaseClient,
  id: string,
  reviewerId: string,
  probe: (ats: DetectedAts) => Promise<number> = probeFeed,
  today: string = new Date().toISOString().slice(0, 10)
): Promise<ApproveResult> {
  const { data: claimed, error: claimError } = await db
    .from('source_requests')
    .update({ status: 'approved', reviewed_by: reviewerId, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'pending')
    .not('detected_endpoint', 'is', null)
    .select('id, company_name, contact_email, detected_vendor, detected_endpoint')
    .maybeSingle()
  if (claimError) return { ok: false, kind: 'error', message: claimError.message }
  if (!claimed) return { ok: false, kind: 'conflict' }
  const request = claimed as ClaimedRequest

  // Every failure after the claim hands the request back to the queue.
  const release = () =>
    db.from('source_requests').update({ status: 'pending', reviewed_by: null }).eq('id', id).eq('status', 'approved')

  const ats: DetectedAts = { vendor: request.detected_vendor, endpoint: request.detected_endpoint }
  let postings: number
  try {
    postings = await probe(ats)
  } catch (e) {
    await release()
    return { ok: false, kind: 'probe_failed', message: e instanceof Error ? e.message : String(e) }
  }
  if (postings > MAX_AUTO_APPROVE_POSTINGS) {
    await release()
    return {
      ok: false,
      kind: 'too_large',
      message: `${postings} postings: this is a whole global job site and needs a location filter set up by hand`,
    }
  }

  const consent = { type: 'explicit', recorded_at: today, request_id: request.id, by: request.contact_email }

  // An employer opting in for a feed we already read: record the consent on
  // that source. A second row on the same endpoint would double every job.
  const { data: existing } = await db
    .from('sources')
    .select('id, slug, config')
    .eq('endpoint', ats.endpoint)
    .maybeSingle()
  if (existing) {
    const { error: mergeError } = await db
      .from('sources')
      .update({ config: { ...(existing.config as Record<string, unknown>), consent }, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
    if (mergeError) {
      await release()
      return { ok: false, kind: 'error', message: mergeError.message }
    }
    await db.from('source_requests').update({ source_id: existing.id }).eq('id', id)
    return { ok: true, sourceId: existing.id, slug: existing.slug, postings, existing: true }
  }

  const slug = await freeSlug(db, request.company_name)
  const { data: source, error: insertError } = await db
    .from('sources')
    .insert({
      slug,
      name: request.company_name,
      tier: 'A',
      adapter: 'ats',
      endpoint: ats.endpoint,
      // Review-only like every other new source: no auto_publish.
      config: { vendor: ats.vendor, consent },
      frequency: 'nightly',
      enabled: true,
    })
    .select('id')
    .single()
  if (insertError || !source) {
    await release()
    return { ok: false, kind: 'error', message: insertError?.message ?? 'source insert returned nothing' }
  }

  await db.from('source_requests').update({ source_id: source.id }).eq('id', id)
  return { ok: true, sourceId: source.id, slug, postings, existing: false }
}

export async function rejectSourceRequest(db: SupabaseClient, id: string, reviewerId: string) {
  const { data, error } = await db
    .from('source_requests')
    .update({ status: 'rejected', reviewed_by: reviewerId, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'pending')
    .select('id')
  if (error) return { ok: false as const, kind: 'error' as const, message: error.message }
  if (!data || data.length === 0) return { ok: false as const, kind: 'conflict' as const }
  return { ok: true as const }
}
