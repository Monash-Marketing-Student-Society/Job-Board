import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { sendEmail } from '@/lib/email'
import { isCurrentUserAdmin } from '@/lib/supabase/server'
import { createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { SUBMISSIONS_TAG } from '@/lib/admin-data'
import { approvalEmail } from '@/lib/email-templates'
import { sanitizeDescription } from '@/lib/sanitize'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const isAdmin = await isCurrentUserAdmin()
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServerClient()

  // Fetch the pending submission
  const { data: submission, error: fetchError } = await supabase
    .from('job_submissions')
    .select('*')
    .eq('id', id)
    .eq('status', 'pending')
    .single()

  if (fetchError || !submission) {
    return NextResponse.json({ error: 'Submission not found or already actioned' }, { status: 404 })
  }

  // Insert into live jobs table using service-role client (bypasses RLS)
  const adminClient = createAdminClient()
  const { error: insertError } = await adminClient.from('jobs').insert({
    source: 'submission',
    title: submission.title,
    company: submission.company,
    location: submission.location,
    work_mode: submission.work_mode,
    job_type: submission.job_type,
    url: submission.url,
    // Last gate before this becomes a public job. Submissions stored before
    // the submit routes sanitised are still in the queue, and an admin
    // approving one reviews the rendered output, where a payload is invisible.
    description: sanitizeDescription(submission.description) || null,
    summary: submission.summary,
    company_logo_url: submission.company_logo_url,
    tags: submission.tags,
    posted_at: new Date().toISOString(),
    closing_at: submission.closing_at,
    is_active: true,
    is_sponsored: false,
  })

  if (insertError) {
    return NextResponse.json({ error: 'Failed to publish job' }, { status: 500 })
  }

  // Mark submission as approved
  await supabase
    .from('job_submissions')
    .update({ status: 'approved' })
    .eq('id', id)

  // The pending count in the admin nav is cached — drop it now that this
  // submission has left the pending set.
  revalidateTag(SUBMISSIONS_TAG)

  // Notify the HR submitter their listing is live (non-blocking, never silent)
  const emailResult = await sendEmail(
    {
      from: 'MMSS Job Board <noreply@monashmss.com>',
      to: submission.submitter_email,
      subject: `Your listing "${submission.title}" is now live on the MMSS Job Board!`,
      html: approvalEmail(submission),
      text: [
        `Hi ${submission.submitter_name},`,
        '',
        `Great news — your listing "${submission.title}" at ${submission.company} has been approved and is now live on the MMSS Job Board.`,
        '',
        `View the board: ${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}`,
        '',
        'Thank you for connecting with Monash marketing students.',
        'MMSS Job Board Team',
      ].join('\n'),
    },
    'approval notification'
  )

  // The job is published either way — but the admin needs to know if the
  // submitter was never told, so they can follow up manually.
  return NextResponse.json({
    success: true,
    email_sent: emailResult.ok,
    email_error: emailResult.ok ? undefined : emailResult.error,
  })
}
