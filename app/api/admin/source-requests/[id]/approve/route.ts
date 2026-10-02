import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminId, unauthorized } from '@/lib/sync/staged-http'
import { approveSourceRequest } from '@/lib/sync/source-requests'

/**
 * Approve an employer's feed request: probe the feed live, then create a
 * review-only source carrying the employer's explicit consent. The source's
 * first read is the next nightly run.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const reviewerId = await requireAdminId()
  if (!reviewerId) return unauthorized()

  const { id } = await params
  const result = await approveSourceRequest(createAdminClient(), id, reviewerId)

  if (result.ok) {
    return NextResponse.json({ success: true, slug: result.slug, postings: result.postings, existing: result.existing })
  }
  if (result.kind === 'conflict') {
    return NextResponse.json({ error: 'Already actioned, or this job system cannot be read automatically' }, { status: 409 })
  }
  if (result.kind === 'probe_failed' || result.kind === 'too_large') {
    return NextResponse.json({ error: `Not added: ${result.message}. The request is back in the queue.` }, { status: 422 })
  }
  console.error('Feed request approval failed:', result.message)
  return NextResponse.json({ error: 'Could not add the source. The request is back in the queue.' }, { status: 500 })
}
