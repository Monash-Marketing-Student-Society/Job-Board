/**
 * Shared plumbing for the /api/admin/staged/* routes: the admin gate and the
 * ActionResult -> HTTP mapping, so all three routes answer identically.
 */

import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getUser, isCurrentUserAdmin } from '../supabase/server'
import { checkPosting } from '../maintain/posting-check'
import type { ActionResult } from './staged-actions'

/** The reviewer's user id, or null if the caller is not an admin. */
export async function requireAdminId(): Promise<string | null> {
  if (!(await isCurrentUserAdmin())) return null
  const user = await getUser()
  return user?.id ?? null
}

export function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

/**
 * Every job on the board needs a logo: the refusal both approve routes give
 * when none could be found automatically. `next` says what can still fix it.
 */
export function noLogoResponse(company: string, next = "None came with the job, so it can't go on the board.") {
  return NextResponse.json({ error: `${company} has no logo. ${next}`, code: 'no_logo' }, { status: 422 })
}

export function toResponse(result: ActionResult) {
  if (result.ok) return NextResponse.json({ success: true, job_id: result.jobId })
  if (result.kind === 'conflict') {
    // 409, not 404: for a racing admin the row exists, it just isn't pending.
    return NextResponse.json({ error: 'Not found or already actioned' }, { status: 409 })
  }
  if (result.kind === 'duplicate') {
    return NextResponse.json(
      { error: 'This job is already in the review queue or on the board, from this or another source' },
      { status: 409 }
    )
  }
  if (result.kind === 'no_logo') return noLogoResponse(result.company)
  console.error('Staged job action failed:', result.message)
  const error = result.stranded
    ? 'Could not publish the job, and could not return it to the queue. It is marked approved with nothing on the board -- set it back to pending before retrying.'
    : 'Action failed'
  return NextResponse.json({ error }, { status: 500 })
}

/** How long approve waits on the employer's page before publishing anyway. */
const APPROVE_CHECK_TIMEOUT_MS = 6_000

/**
 * Checked as an admin approves: has the role closed while it waited? Its
 * closing date passing, or its page saying so (404, an expired redirect, a
 * closed notice). A closed one is rejected as expired and its reason
 * returned; null publishes as normal. An unreadable page -- LinkedIn's bot
 * wall from Vercel -- never blocks an approval; the maintain run reads
 * LinkedIn through Bright Data instead.
 */
export async function closedOnApprove(db: SupabaseClient, id: string, reviewerId: string): Promise<string | null> {
  const { data } = await db.from('staged_jobs').select('normalised').eq('id', id).eq('status', 'pending').maybeSingle()
  const j = (data?.normalised ?? null) as { url?: string | null; closing_at?: string | null } | null
  if (!j) return null

  let reason: string | null = null
  const closing = j.closing_at ? Date.parse(j.closing_at) : NaN
  if (!Number.isNaN(closing) && closing < Date.now()) reason = `its closing date (${j.closing_at!.slice(0, 10)}) has passed`
  else if (j.url) {
    const check = await checkPosting(j.url, APPROVE_CHECK_TIMEOUT_MS)
    if (check.state === 'closed') reason = `the posting says it has closed (${check.reason})`
  }
  if (!reason) return null

  await db
    .from('staged_jobs')
    .update({ status: 'rejected', reject_reason: 'expired', reject_comment: `Expired on approve: ${reason}`.slice(0, 500), reviewed_by: reviewerId, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'pending')
  return reason
}

export function expiredResponse(reason: string) {
  return NextResponse.json(
    { error: `This role has closed: ${reason}. It was removed from the queue instead of being published.`, code: 'expired' },
    { status: 410 }
  )
}
