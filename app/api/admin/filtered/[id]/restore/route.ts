import { revalidateTag } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { SUBMISSIONS_TAG } from '@/lib/admin-data'
import { restoreFiltered } from '@/lib/sync/staged-actions'
import { requireAdminId, toResponse, unauthorized } from '@/lib/sync/staged-http'

/**
 * Move a posting the filter removed into the synced review queue -- the
 * admin's call that the rule got it wrong. It is reviewed there like any
 * other synced job, never published from here.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const reviewerId = await requireAdminId()
  if (!reviewerId) return unauthorized()

  const result = await restoreFiltered(createAdminClient(), id, reviewerId)
  revalidateTag(SUBMISSIONS_TAG)
  return toResponse(result)
}
