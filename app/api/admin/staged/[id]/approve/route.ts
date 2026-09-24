import { revalidateTag } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { SUBMISSIONS_TAG } from '@/lib/admin-data'
import { approveStaged } from '@/lib/sync/staged-actions'
import { requireAdminId, toResponse, unauthorized } from '@/lib/sync/staged-http'

/**
 * Approve a synced job held for review. The service-role client is used only
 * after the admin check: staged_jobs has no client write policy by design
 * (supabase/migrations/0030). Sends no email -- a synced job has no submitter.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const reviewerId = await requireAdminId()
  if (!reviewerId) return unauthorized()

  const result = await approveStaged(createAdminClient(), id, reviewerId)
  revalidateTag(SUBMISSIONS_TAG)
  return toResponse(result)
}
