import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { SUBMISSIONS_TAG } from '@/lib/admin-data'
import { bulkAction, isRejectReason, type RejectReason } from '@/lib/sync/staged-actions'
import { requireAdminId, unauthorized } from '@/lib/sync/staged-http'

/** Enough for a whole run's worth of held jobs; bounds how long one request can run. */
const MAX_IDS = 100

/**
 * Approve or reject a list of staged jobs -- one claim per row, partial
 * success reported per id rather than rolled back.
 */
export async function POST(request: Request) {
  const reviewerId = await requireAdminId()
  if (!reviewerId) return unauthorized()

  const body = await request.json().catch(() => ({}))
  const ids: unknown = body.ids
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_IDS || !ids.every((i) => typeof i === 'string')) {
    return NextResponse.json({ error: `ids must be 1-${MAX_IDS} strings` }, { status: 400 })
  }

  let action: { type: 'approve' } | { type: 'reject'; reason: RejectReason }
  if (body.action === 'approve') action = { type: 'approve' }
  else if (body.action === 'reject' && isRejectReason(body.reason)) action = { type: 'reject', reason: body.reason }
  else return NextResponse.json({ error: 'action must be approve, or reject with a valid reason' }, { status: 400 })

  const outcomes = await bulkAction(createAdminClient(), ids as string[], action, reviewerId)
  revalidateTag(SUBMISSIONS_TAG)

  const succeeded = outcomes.filter((o) => o.result.ok).map((o) => o.id)
  const failed = outcomes
    .filter((o) => !o.result.ok)
    .map((o) => ({ id: o.id, reason: o.result.ok ? null : o.result.kind }))
  for (const o of outcomes) if (!o.result.ok && o.result.kind === 'error') console.error('Bulk staged action failed:', o.id, o.result.message)

  return NextResponse.json({ succeeded, failed })
}
