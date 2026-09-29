/**
 * Approve and reject for synced jobs held in staged_jobs.
 *
 * Kept here rather than in the route files so the ordering -- the part that
 * matters -- is under test. The routes check the caller is an admin and then
 * hand over a service-role client: staged_jobs deliberately has no client
 * write policy (0030), because approving has to touch three tables and a
 * bare RLS UPDATE can't coordinate that.
 *
 * Both actions copy the submissions routes' concurrency guard: claim with
 * `UPDATE ... WHERE status = 'pending'` before doing anything else. Postgres
 * re-evaluates that predicate against the committed row, so of two admins
 * racing, exactly one wins and the other gets `conflict`. What they must NOT
 * copy is the email: a synced job has no submitter, so nothing is sent.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { sanitizeDescription } from '../sanitize'
import type { NormalisedJob } from './normalise'

export const REJECT_REASONS = ['irrelevant', 'duplicate', 'expired', 'employer_blocked', 'bad_link', 'other'] as const
export type RejectReason = (typeof REJECT_REASONS)[number]

export function isRejectReason(value: unknown): value is RejectReason {
  return typeof value === 'string' && (REJECT_REASONS as readonly string[]).includes(value)
}

export type ActionResult =
  | { ok: true; jobId?: string }
  | { ok: false; kind: 'conflict' }
  | { ok: false; kind: 'error'; message: string; stranded?: boolean }

interface ClaimedRow {
  id: string
  external_id: string | null
  fingerprint: string
  normalised: NormalisedJob
  sources: { slug: string } | { slug: string }[] | null
}

function slugOf(row: ClaimedRow): string | null {
  const src = Array.isArray(row.sources) ? row.sources[0] : row.sources
  return src?.slug ?? null
}

export async function approveStaged(db: SupabaseClient, id: string, reviewerId: string): Promise<ActionResult> {
  const { data: claimed, error: claimError } = await db
    .from('staged_jobs')
    .update({ status: 'approved', reviewed_by: reviewerId, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'pending')
    .select('id, external_id, fingerprint, normalised, sources(slug)')
    .maybeSingle()

  if (claimError) return { ok: false, kind: 'error', message: `claim: ${claimError.message}` }
  if (!claimed) return { ok: false, kind: 'conflict' }

  const row = claimed as unknown as ClaimedRow
  const slug = slugOf(row)
  const j = row.normalised

  const { data: job, error: insertError } = slug
    ? await db
        .from('jobs')
        .insert({
          source: `sync:${slug}`,
          external_id: row.external_id,
          title: j.title,
          company: j.company,
          location: j.location,
          work_mode: j.work_mode,
          job_type: j.job_type,
          url: j.url,
          // Last gate before this becomes a public job, same as the
          // submissions approve route: an admin reviews the rendered output,
          // where a payload is invisible.
          description: sanitizeDescription(j.description) || null,
          tags: j.tags,
          // Left as the posting's own date (usually null for a synced job),
          // not stamped now: the board sorts by posted_at with nulls last, so
          // an approved synced job sits below human listings -- the PRD's
          // ordering -- rather than jumping to the top.
          posted_at: j.posted_at,
          closing_at: j.closing_at,
          is_active: true,
          is_sponsored: false,
          // A human approved this, so it is not an auto-published job and must
          // not appear in the seven-day unattended-publish audit.
          auto_published_at: null,
        })
        .select('id')
        .single()
    : { data: null, error: { message: 'staged row has no source' } }

  if (insertError || !job) {
    // Release the claim so the job goes back in the queue rather than sitting
    // 'approved' with nothing on the board. Checked, not fire-and-forget.
    const { error: releaseError } = await db
      .from('staged_jobs')
      .update({ status: 'pending', reviewed_by: null })
      .eq('id', id)
    return {
      ok: false,
      kind: 'error',
      message: `publish: ${insertError?.message ?? 'no row returned'}`,
      stranded: Boolean(releaseError),
    }
  }

  // Repoint the fingerprint from the staged row to the live job, so the next
  // run's dedup finds the job itself. staged_job_id is cleared rather than
  // kept: that FK cascades, and a later cleanup of staged rows must not take
  // the fingerprint -- and with it the memory of this posting -- with it.
  // A failure here doesn't un-publish anything; the (source, external_id)
  // check still catches the posting next run, so it is reported, not undone.
  const { error: fpError } = await db
    .from('job_fingerprints')
    .update({ job_id: job.id, staged_job_id: null })
    .eq('fingerprint', row.fingerprint)
  if (fpError) return { ok: false, kind: 'error', message: `published, but fingerprint not repointed: ${fpError.message}` }

  return { ok: true, jobId: job.id }
}

/**
 * The fingerprint is deliberately left in place: a rejected posting must not
 * come back on the next run, and the fingerprint is what stops it.
 */
export async function rejectStaged(
  db: SupabaseClient,
  id: string,
  reason: RejectReason,
  reviewerId: string
): Promise<ActionResult> {
  const { data, error } = await db
    .from('staged_jobs')
    .update({ status: 'rejected', reject_reason: reason, reviewed_by: reviewerId, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()

  if (error) return { ok: false, kind: 'error', message: `reject: ${error.message}` }
  if (!data) return { ok: false, kind: 'conflict' }
  return { ok: true }
}

export interface BulkOutcome {
  id: string
  result: ActionResult
}

/** One claim per row, sequentially -- partial success is reported, not rolled back. */
export async function bulkAction(
  db: SupabaseClient,
  ids: string[],
  action: { type: 'approve' } | { type: 'reject'; reason: RejectReason },
  reviewerId: string
): Promise<BulkOutcome[]> {
  const outcomes: BulkOutcome[] = []
  for (const id of ids) {
    const result =
      action.type === 'approve' ? await approveStaged(db, id, reviewerId) : await rejectStaged(db, id, action.reason, reviewerId)
    outcomes.push({ id, result })
  }
  return outcomes
}
