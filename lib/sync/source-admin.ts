/**
 * The /admin/sources controls: pause, demote, and the auto-publish switch.
 *
 * Deliberately narrow. The TDD's PATCH also lists `frequency` and free-form
 * `config` edits; neither is here. The worker only schedules 'nightly'
 * sources (worker.ts loadSources), so moving one to 'six_hourly' would
 * silently stop it running, and a hand-edited `config` can break the vendor
 * lookup for a source that works today. Both stay SQL-editor changes until
 * there is a reason to expose them.
 *
 * `auto_publish` lives inside `config` (run.ts isReviewOnly), so turning it
 * on or off is a read-merge-write of the jsonb, never a replace -- a replace
 * would drop `vendor` and fail the next run. The write is guarded on the
 * `updated_at` it read, so two admins toggling at once can't lose each
 * other's change. The worker never writes `config` or `updated_at` (it sets
 * only last_run_at / usual_count), so it can't trip the guard.
 */

import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { NEW_ADAPTER_REVIEW_COUNT } from './risk'

export const sourcePatchSchema = z
  .object({
    enabled: z.boolean(),
    tier: z.enum(['A', 'B', 'C']),
    auto_publish: z.boolean(),
  })
  .partial()
  .strict()
  .refine((p) => Object.keys(p).length > 0, { message: 'Nothing to change' })

export type SourcePatch = z.infer<typeof sourcePatchSchema>

export interface AdminSource {
  id: string
  slug: string
  name: string
  tier: 'A' | 'B' | 'C'
  endpoint: string
  config: Record<string, unknown>
  frequency: string
  enabled: boolean
  usual_count: number | null
  last_run_at: string | null
  updated_at: string
}

export const ADMIN_SOURCE_COLUMNS =
  'id, slug, name, tier, endpoint, config, frequency, enabled, usual_count, last_run_at, updated_at'

export type UpdateResult =
  | { ok: true; source: AdminSource }
  | { ok: false; kind: 'not_found' }
  | { ok: false; kind: 'conflict' }
  | { ok: false; kind: 'error'; message: string }

export async function updateSource(db: SupabaseClient, id: string, patch: SourcePatch): Promise<UpdateResult> {
  const { data: current, error: readError } = await db
    .from('sources')
    .select('config, updated_at')
    .eq('id', id)
    .maybeSingle()
  if (readError) return { ok: false, kind: 'error', message: readError.message }
  if (!current) return { ok: false, kind: 'not_found' }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.enabled !== undefined) update.enabled = patch.enabled
  if (patch.tier !== undefined) update.tier = patch.tier
  if (patch.auto_publish !== undefined) {
    update.config = { ...(current.config as Record<string, unknown>), auto_publish: patch.auto_publish }
  }

  const { data, error } = await db
    .from('sources')
    .update(update)
    .eq('id', id)
    .eq('updated_at', current.updated_at)
    .select(ADMIN_SOURCE_COLUMNS)
  if (error) return { ok: false, kind: 'error', message: error.message }
  // Zero rows back with no error: someone else wrote the row since we read it.
  if (!data || data.length === 0) return { ok: false, kind: 'conflict' }
  return { ok: true, source: data[0] as AdminSource }
}

// ---------------------------------------------------------------------------
// What the page shows. Pure, so the rules are tested rather than eyeballed.
// ---------------------------------------------------------------------------

export interface RunRow {
  started_at: string
  finished_at: string | null
  seen: number
  created: number
  deduped: number
  rejected: number
  held: number
  error: string | null
  zero_guard_tripped: boolean
}

export type RunHealth =
  | { state: 'never' }
  | { state: 'failed'; error: string }
  | { state: 'low' }
  | { state: 'stale' }
  | { state: 'ok' }

/**
 * A nightly run at 02:00 Melbourne should never be more than a day old. 36h
 * leaves a missed-by-minutes run alone and flags a schedule that stopped
 * firing (a Trigger.dev deploy that dropped the cron, say) by the second
 * morning.
 */
export const STALE_AFTER_HOURS = 36

export function runHealth(last: RunRow | null, source: Pick<AdminSource, 'enabled' | 'frequency'>, now: Date): RunHealth {
  if (!last) return { state: 'never' }
  if (last.error) return { state: 'failed', error: last.error }
  if (last.zero_guard_tripped) return { state: 'low' }
  const ageHours = (now.getTime() - new Date(last.started_at).getTime()) / 3_600_000
  if (source.enabled && source.frequency === 'nightly' && ageHours > STALE_AFTER_HOURS) return { state: 'stale' }
  return { state: 'ok' }
}

/**
 * What actually happens to a clean posting from this source on the next
 * run. `auto_publish` alone doesn't answer that: risk.ts still holds every
 * posting from a tier B/C source, and the first NEW_ADAPTER_REVIEW_COUNT
 * jobs from any source.
 */
export type PublishMode =
  | { mode: 'paused' }
  | { mode: 'review_only' }
  | { mode: 'held_by_tier' }
  | { mode: 'warming_up'; published: number; needed: number }
  | { mode: 'auto' }

export function publishMode(source: Pick<AdminSource, 'enabled' | 'tier' | 'config'>, published: number): PublishMode {
  if (!source.enabled) return { mode: 'paused' }
  if (source.config.auto_publish !== true) return { mode: 'review_only' }
  if (source.tier !== 'A') return { mode: 'held_by_tier' }
  if (published < NEW_ADAPTER_REVIEW_COUNT) return { mode: 'warming_up', published, needed: NEW_ADAPTER_REVIEW_COUNT }
  return { mode: 'auto' }
}

export interface ReviewTally {
  pending: number
  approved: number
  rejected: number
}

/** Rejected share of what a human has decided on, or null with nothing decided yet. */
export function rejectRate(t: ReviewTally): number | null {
  const decided = t.approved + t.rejected
  return decided === 0 ? null : t.rejected / decided
}

/** The PRD's bar for leaving review-only: rejects under 10% through the soak. */
export const SOAK_MAX_REJECT_RATE = 0.1

export function tallyReviews(rows: Array<{ source_id: string; status: string }>): Map<string, ReviewTally> {
  const out = new Map<string, ReviewTally>()
  for (const row of rows) {
    const t = out.get(row.source_id) ?? { pending: 0, approved: 0, rejected: 0 }
    if (row.status === 'pending' || row.status === 'approved' || row.status === 'rejected') t[row.status]++
    out.set(row.source_id, t)
  }
  return out
}

/** jobs.source values ('sync:<slug>') -> live-or-not published count per slug. */
export function countPublishedBySlug(rows: Array<{ source: string }>): Map<string, number> {
  const out = new Map<string, number>()
  for (const { source } of rows) {
    if (!source.startsWith('sync:')) continue
    const slug = source.slice('sync:'.length)
    out.set(slug, (out.get(slug) ?? 0) + 1)
  }
  return out
}
