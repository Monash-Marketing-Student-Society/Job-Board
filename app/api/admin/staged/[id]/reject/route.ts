import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { SUBMISSIONS_TAG } from '@/lib/admin-data'
import { isRejectReason, rejectStaged } from '@/lib/sync/staged-actions'
import { requireAdminId, toResponse, unauthorized } from '@/lib/sync/staged-http'

/**
 * Reject a synced job held for review. Keeps its fingerprint, so the same
 * posting does not come back on the next run.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const reviewerId = await requireAdminId()
  if (!reviewerId) return unauthorized()

  const body = await request.json().catch(() => ({}))
  if (!isRejectReason(body.reason)) {
    return NextResponse.json({ error: 'A valid reject reason is required' }, { status: 400 })
  }

  const result = await rejectStaged(createAdminClient(), id, body.reason, reviewerId)
  revalidateTag(SUBMISSIONS_TAG)
  return toResponse(result)
}
