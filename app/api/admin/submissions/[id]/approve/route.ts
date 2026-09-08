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

  // Claim the submission BEFORE publishing anything.
  //
  // `UPDATE ... WHERE status = 'pending'` is the concurrency guard. Postgres
  // re-evaluates that predicate against the committed row, so of two callers
  // racing — two admins working the queue, or one double-click on a stale page
  // — exactly one matches a pending row and the other comes back empty. A plain
  // SELECT could not do this: both callers would see 'pending' and both would
  // go on to publish.
  //
  // The previous order was fetch → insert → update-and-ignore-the-result. If
  // that final update failed the job was already live while the submission
  // stayed pending, so it reappeared in the queue and the next approval
  // published a second copy. Nothing downstream would have caught it: the only
  // unique constraint on `jobs` is (source, external_id), and external_id is
  // null for every submission.
  const { data: submission, error: claimError } = await supabase
    .from('job_submissions')
    .update({ status: 'approved' })
    .eq('id', id)
    .eq('status', 'pending')
    .select()
    .maybeSingle()

  if (claimError) {
    console.error('Failed to claim submission for approval:', claimError)
    return NextResponse.json({ error: 'Failed to approve submission' }, { status: 500 })
  }

  if (!submission) {
    // Either the id is unknown or someone else already actioned it. 409 rather
    // than 404: for the racing admin the row exists, it just is not theirs to
    // approve any more.
    return NextResponse.json(
      { error: 'Submission not found or already actioned' },
      { status: 409 }
    )
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
    console.error('Failed to publish job from submission:', insertError)

    // Release the claim so the submission goes back in the queue rather than
    // sitting 'approved' with nothing published. Checked, not fire-and-forget:
    // if this fails too the row is stranded, and the admin needs to be told
    // that rather than shown a generic retryable error.
    const { error: releaseError } = await supabase
      .from('job_submissions')
      .update({ status: 'pending' })
      .eq('id', id)

    revalidateTag(SUBMISSIONS_TAG)

    if (releaseError) {
      console.error('Failed to release claim after publish failure:', releaseError)
      return NextResponse.json(
        {
          error:
            'Could not publish the job, and could not return the submission to the queue. ' +
            'It is now marked approved with nothing on the board — set it back to pending before retrying.',
        },
        { status: 500 }
      )
    }

    return NextResponse.json({ error: 'Failed to publish job' }, { status: 500 })
  }

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
