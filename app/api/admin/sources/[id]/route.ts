import { NextResponse } from 'next/server'
import { isCurrentUserAdmin } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sourcePatchSchema, updateSource } from '@/lib/sync/source-admin'

/**
 * PATCH /api/admin/sources/[id] — pause/resume, demote/promote, and the
 * auto-publish switch. sources has no authenticated write policy (0029), so
 * this runs as the service role behind the admin check, like the staged
 * routes. Takes effect on the next run; nothing is re-run here.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isCurrentUserAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json().catch(() => null)
  const parsed = sourcePatchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Only enabled, tier and auto_publish can be changed here' }, { status: 400 })
  }

  const result = await updateSource(createAdminClient(), id, parsed.data)
  if (result.ok) return NextResponse.json({ source: result.source })
  if (result.kind === 'not_found') return NextResponse.json({ error: 'Source not found' }, { status: 404 })
  if (result.kind === 'conflict') {
    return NextResponse.json({ error: 'Someone else changed this source. The page has been refreshed; try again.' }, { status: 409 })
  }
  console.error('Source update failed:', result.message)
  return NextResponse.json({ error: 'Could not save the change' }, { status: 500 })
}
