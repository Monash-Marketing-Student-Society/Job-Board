import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { createServerClient, isCurrentUserAdmin } from '@/lib/supabase/server'
import { SUBMISSIONS_TAG } from '@/lib/admin-data'
import { parseDraftEdit } from '@/lib/draft-edit'

/**
 * Save an admin's edits to a pending HR submission, from its preview page,
 * so what approval publishes is the corrected listing. Same admin UPDATE
 * policy the approve route claims through. Only pending rows: once a
 * submission is approved the live job is edited on Manage Jobs instead.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!(await isCurrentUserAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const parsed = parseDraftEdit(await request.json().catch(() => null))
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('job_submissions')
    .update({ ...parsed.edit, tags: parsed.edit.tags.length > 0 ? parsed.edit.tags : null })
    .eq('id', id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()

  if (error) {
    console.error('Failed to save submission edit:', error)
    return NextResponse.json({ error: 'Failed to save changes' }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'Only a pending submission can be edited' }, { status: 409 })
  }

  revalidateTag(SUBMISSIONS_TAG)
  return NextResponse.json({ success: true })
}
