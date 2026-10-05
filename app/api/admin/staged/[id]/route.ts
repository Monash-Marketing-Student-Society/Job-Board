import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseDraftEdit } from '@/lib/draft-edit'
import { editStaged } from '@/lib/sync/staged-actions'
import { requireAdminId, toResponse, unauthorized } from '@/lib/sync/staged-http'

/**
 * Save an admin's edits to a synced job still waiting for review, from its
 * preview page. Only the posting's fields change; risk reasons, source and
 * fingerprint stay as the sync wrote them.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const reviewerId = await requireAdminId()
  if (!reviewerId) return unauthorized()

  const parsed = parseDraftEdit(await request.json().catch(() => null))
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  return toResponse(await editStaged(createAdminClient(), id, parsed.edit))
}
