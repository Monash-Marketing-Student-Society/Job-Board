import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { toJobFunctions } from '@/lib/tags'
import { sanitizeDescription } from '@/lib/sanitize'
import { jobSubmissionSchema } from '@/lib/job-submission-schema'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  // Same trust model as the POST route — the edit link is public and this
  // writes through the service-role client. The route already enumerates the
  // columns it updates, so the schema is not load-bearing against
  // mass-assignment here, but it still rejects a malformed email, a
  // non-http(s) URL or a bad enum before any of it reaches the row.
  const parsed = jobSubmissionSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid submission', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }
  const body = parsed.data

  const adminClient = createAdminClient()

  // Verify the token belongs to a pending submission
  const { data: existing, error: fetchError } = await adminClient
    .from('job_submissions')
    .select('id, status')
    .eq('edit_token', token)
    .single()

  if (fetchError || !existing) {
    return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
  }

  if (existing.status !== 'pending') {
    return NextResponse.json(
      { error: 'This submission has already been reviewed and can no longer be edited.' },
      { status: 409 }
    )
  }

  const editedTags = toJobFunctions(body.tags)

  const { error: updateError } = await adminClient
    .from('job_submissions')
    .update({
      submitter_name: body.submitter_name,
      submitter_email: body.submitter_email,
      submitter_company_name: body.submitter_company_name,
      title: body.title,
      company: body.company,
      location: body.location ?? null,
      work_mode: body.work_mode ?? null,
      job_type: body.job_type ?? null,
      url: body.url,
      // Same reasoning as the POST route — the edit link is public.
      description: sanitizeDescription(body.description) || null,
      summary: body.summary ?? null,
      company_logo_url: body.company_logo_url ?? null,
      // Same reasoning as the POST route: the edit link is public, so the
      // vocabulary is enforced here rather than trusted from the client.
      tags: editedTags.length > 0 ? editedTags : null,
      closing_at: body.closing_at ?? null,
      is_sponsored: body.is_sponsored ?? false,
    })
    .eq('edit_token', token)

  if (updateError) {
    return NextResponse.json({ error: 'Failed to update submission' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
