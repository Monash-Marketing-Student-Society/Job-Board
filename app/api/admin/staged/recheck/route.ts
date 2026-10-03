import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { SUBMISSIONS_TAG } from '@/lib/admin-data'
import { recheckPending } from '@/lib/sync/staged-actions'
import { requireAdminId, unauthorized } from '@/lib/sync/staged-http'

/**
 * Run the current filter over the pending synced queue. `{ apply: false }`
 * (the default) only lists what would go, so the admin sees it before
 * anything changes; `{ apply: true }` rejects those rows.
 */
export async function POST(request: Request) {
  const reviewerId = await requireAdminId()
  if (!reviewerId) return unauthorized()

  const body = await request.json().catch(() => ({}))
  const apply = body.apply === true

  const removals = await recheckPending(createAdminClient(), reviewerId, { apply })
  if ('error' in removals) {
    console.error('Staged recheck failed:', removals.error)
    return NextResponse.json({ error: 'Recheck failed' }, { status: 500 })
  }
  if (apply) revalidateTag(SUBMISSIONS_TAG)

  return NextResponse.json({
    removed: removals.filter((r) => r.result.ok).map(({ id, title, company, reason, comment }) => ({ id, title, company, reason, comment })),
    failed: removals.filter((r) => !r.result.ok).map((r) => r.id),
  })
}
