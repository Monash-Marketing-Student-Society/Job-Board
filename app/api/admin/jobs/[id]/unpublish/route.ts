import { isCurrentUserAdmin } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { unpublishJob } from '@/lib/sync/auto-published'
import { toResponse, unauthorized } from '@/lib/sync/staged-http'

/**
 * POST /api/admin/jobs/[id]/unpublish — takes an auto-published synced job
 * off the board. Backs the seven-day review on /admin/sources. The row is
 * kept, so the next sync run recognises the posting and leaves it off.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isCurrentUserAdmin())) return unauthorized()

  const { id } = await params
  return toResponse(await unpublishJob(createAdminClient(), id))
}
