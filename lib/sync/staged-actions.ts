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
import { approvedLogoFor } from '../company-logos'
import { sourceLogoUrl } from '../logos'
import { sanitizeDescription } from '../sanitize'
import { computeFingerprint } from './fingerprint'
import { resolveCity } from './location'
import type { NormalisedJob } from './normalise'
import type { RiskReason } from './risk'
import { assessTarget, type TargetRule } from './target'

export const REJECT_REASONS = [
  'irrelevant',
  'too_senior',
  'experience_required',
  'duplicate',
  'expired',
  'employer_blocked',
  'bad_link',
  'other',
] as const
export type RejectReason = (typeof REJECT_REASONS)[number]

export function isRejectReason(value: unknown): value is RejectReason {
  return typeof value === 'string' && (REJECT_REASONS as readonly string[]).includes(value)
}

/** Matches the staged_jobs CHECK constraint (0055). */
export const REJECT_COMMENT_MAX = 500

/**
 * A reject comment from a request body: trimmed, empty means none. Returns
 * undefined for anything that isn't a usable comment, so the route can 400
 * rather than silently dropping what the admin typed.
 */
export function parseRejectComment(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (trimmed.length > REJECT_COMMENT_MAX) return undefined
  return trimmed || null
}

export type ActionResult =
  | { ok: true; jobId?: string }
  | { ok: false; kind: 'conflict' }
  | { ok: false; kind: 'duplicate' }
  | { ok: false; kind: 'error'; message: string; stranded?: boolean }

interface ClaimedRow {
  id: string
  external_id: string | null
  fingerprint: string
  normalised: NormalisedJob
  sources: ClaimedSource | ClaimedSource[] | null
}

interface ClaimedSource {
  slug: string
  config: Record<string, unknown> | null
}

function sourceOf(row: ClaimedRow): ClaimedSource | null {
  return (Array.isArray(row.sources) ? row.sources[0] : row.sources) ?? null
}

export async function approveStaged(db: SupabaseClient, id: string, reviewerId: string): Promise<ActionResult> {
  const { data: claimed, error: claimError } = await db
    .from('staged_jobs')
    .update({ status: 'approved', reviewed_by: reviewerId, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'pending')
    .select('id, external_id, fingerprint, normalised, sources(slug, config)')
    .maybeSingle()

  if (claimError) return { ok: false, kind: 'error', message: `claim: ${claimError.message}` }
  if (!claimed) return { ok: false, kind: 'conflict' }

  const row = claimed as unknown as ClaimedRow
  const src = sourceOf(row)
  const slug = src?.slug ?? null
  const j = row.normalised
  // An admin-approved logo (/admin/logos) wins; otherwise the source's own domain.
  const logoUrl = (await approvedLogoFor(db, j.company)) ?? sourceLogoUrl(src?.config)

  const { data: job, error: insertError } = slug
    ? await db
        .from('jobs')
        .insert({
          source: `sync:${slug}`,
          external_id: row.external_id,
          title: j.title,
          company: j.company,
          company_logo_url: logoUrl,
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
  reviewerId: string,
  comment: string | null = null
): Promise<ActionResult> {
  const { data, error } = await db
    .from('staged_jobs')
    .update({
      status: 'rejected',
      reject_reason: reason,
      reject_comment: comment,
      reviewed_by: reviewerId,
      updated_at: new Date().toISOString(),
    })
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
  action: { type: 'approve' } | { type: 'reject'; reason: RejectReason; comment?: string | null },
  reviewerId: string
): Promise<BulkOutcome[]> {
  const outcomes: BulkOutcome[] = []
  for (const id of ids) {
    const result =
      action.type === 'approve'
        ? await approveStaged(db, id, reviewerId)
        : await rejectStaged(db, id, action.reason, reviewerId, action.comment ?? null)
    outcomes.push({ id, result })
  }
  return outcomes
}

/** The reject reason a human would pick for what the gate caught. */
const REASON_FOR_RULE: Record<TargetRule, RejectReason> = {
  too_senior_title: 'too_senior',
  experience_required: 'experience_required',
  location: 'irrelevant',
  excluded_field: 'irrelevant',
  not_marketing: 'irrelevant',
}

export interface RecheckRemoval {
  id: string
  title: string
  company: string
  reason: RejectReason
  comment: string
  result: ActionResult
}

/**
 * Runs the current targeting gate over every pending staged job and rejects
 * what it would now remove. The gate only sees new postings, so without this
 * a rule change leaves the queue it was written for untouched.
 *
 * The comment records the rule and the text that fired it, marked as the
 * filter's, so the Feedback list can tell a recheck from a human decision.
 * `apply: false` only reports -- what the admin sees before confirming.
 */
export async function recheckPending(
  db: SupabaseClient,
  reviewerId: string,
  { apply }: { apply: boolean }
): Promise<RecheckRemoval[] | { error: string }> {
  const { data, error } = await db.from('staged_jobs').select('id, normalised').eq('status', 'pending')
  if (error) return { error: error.message }

  const removals: RecheckRemoval[] = []
  for (const row of (data ?? []) as Array<{ id: string; normalised: NormalisedJob }>) {
    const j = row.normalised
    const verdict = assessTarget({
      title: j.title,
      jobType: j.job_type,
      location: j.location,
      tags: j.tags ?? [],
      description: j.description,
    })
    if (verdict.verdict !== 'reject' || !verdict.rule) continue

    const reason = REASON_FOR_RULE[verdict.rule]
    const comment = `Filter recheck: ${verdict.rule}${verdict.evidence ? ` -- "${verdict.evidence}"` : ''}`.slice(
      0,
      REJECT_COMMENT_MAX
    )
    const result: ActionResult = apply ? await rejectStaged(db, row.id, reason, reviewerId, comment) : { ok: true }
    removals.push({ id: row.id, title: j.title, company: j.company, reason, comment, result })
  }
  return removals
}

const RESTORED_RISK: RiskReason[] = ['admin_restored']

/**
 * Puts a posting the filter removed into the review queue, as an admin's
 * call that the rule got it wrong. It goes to review, never straight to the
 * board: restoring says "worth a look", not "approved".
 *
 * Same claim-first pattern as approve/reject (`WHERE status = 'filtered'`),
 * released if staging fails. A posting already known under the same
 * fingerprint -- staged or live from another source -- is refused as a
 * duplicate before claiming, because job_fingerprints keys on it and a
 * second staged copy would have nothing to dedup against.
 *
 * The staged row gets a fingerprint like any other, so the next nightly run
 * dedups against it instead of filtering the posting again.
 */
export async function restoreFiltered(db: SupabaseClient, id: string, reviewerId: string): Promise<ActionResult> {
  const { data: row, error: readError } = await db
    .from('filtered_postings')
    .select('id, source_id, external_id, apply_url_hash, normalised')
    .eq('id', id)
    .eq('status', 'filtered')
    .maybeSingle()
  if (readError) return { ok: false, kind: 'error', message: `read: ${readError.message}` }
  if (!row) return { ok: false, kind: 'conflict' }

  const j = row.normalised as NormalisedJob
  const fingerprint = computeFingerprint(j.company, j.title, resolveCity(j.location))
  const { data: known } = await db.from('job_fingerprints').select('fingerprint').eq('fingerprint', fingerprint).maybeSingle()
  if (known) return { ok: false, kind: 'duplicate' }

  const { data: claimed, error: claimError } = await db
    .from('filtered_postings')
    .update({ status: 'restored', restored_by: reviewerId, restored_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'filtered')
    .select('id')
    .maybeSingle()
  if (claimError) return { ok: false, kind: 'error', message: `claim: ${claimError.message}` }
  if (!claimed) return { ok: false, kind: 'conflict' }

  const { data: staged, error: stageError } = await db
    .from('staged_jobs')
    .insert({
      source_id: row.source_id,
      external_id: row.external_id,
      raw: {},
      normalised: j,
      fingerprint,
      risk_reasons: RESTORED_RISK,
    })
    .select('id')
    .single()

  if (stageError || !staged) {
    const { error: releaseError } = await db
      .from('filtered_postings')
      .update({ status: 'filtered', restored_by: null, restored_at: null })
      .eq('id', id)
    // Not `stranded`: that wording is about approve. A failed release here
    // leaves the posting marked restored with nothing staged, and the message
    // says so for the logs.
    return {
      ok: false,
      kind: 'error',
      message: `stage: ${stageError?.message ?? 'no row returned'}${releaseError ? ' (and still marked restored)' : ''}`,
    }
  }

  // Reported, not undone: without it the posting is still in the queue, and
  // the worst case is the next run filtering a second copy into this list.
  const { error: fpError } = await db.from('job_fingerprints').insert({
    fingerprint,
    source_id: row.source_id,
    staged_job_id: staged.id,
    apply_url_hash: row.apply_url_hash,
    source_job_id: row.external_id,
  })
  if (fpError) return { ok: false, kind: 'error', message: `staged, but fingerprint not recorded: ${fpError.message}` }

  return { ok: true }
}
