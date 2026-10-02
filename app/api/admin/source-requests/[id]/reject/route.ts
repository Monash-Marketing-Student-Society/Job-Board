import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminId, unauthorized } from '@/lib/sync/staged-http'
import { rejectSourceRequest } from '@/lib/sync/source-requests'

/** Decline an employer's feed request. Nothing is sent to the employer. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const reviewerId = await requireAdminId()
  if (!reviewerId) return unauthorized()

  const { id } = await params
  const result = await rejectSourceRequest(createAdminClient(), id, reviewerId)

  if (result.ok) return NextResponse.json({ success: true })
  if (result.kind === 'conflict') return NextResponse.json({ error: 'Already actioned' }, { status: 409 })
  console.error('Feed request rejection failed:', result.message)
  return NextResponse.json({ error: 'Action failed' }, { status: 500 })
}
