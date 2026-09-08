import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { SUBMISSIONS_TAG } from '@/lib/admin-data'
import { sendEmail } from '@/lib/email'
import { isCurrentUserAdmin } from '@/lib/supabase/server'
import { createServerClient } from '@/lib/supabase/server'
import { rejectionEmail } from '@/lib/email-templates'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const isAdmin = await isCurrentUserAdmin()
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const supabase = await createServerClient()

  // Reject only what is still pending, in a single guarded write.
  //
  // The fetch this replaces matched on `id` alone, so an already-approved
  // submission could be rejected: the submitter received a rejection email
  // while the job stayed live on the public board, because rejection never
  // touches the `jobs` table. Two admins working the queue at once, or one
  // click on a page whose data had gone stale, was enough to produce it.
  //
  // `WHERE status = 'pending'` is evaluated against the committed row, so the
  // approve/reject race resolves to whichever lands first and the loser comes
  // back empty rather than acting on a decision already made. Same guard, same
  // reasoning as the approve route.
  //
  // RETURNING also supplies the row the email needs, so the separate fetch is
  // gone — there is no longer a window between reading the status and acting
  // on it.
  const { data: submission, error } = await supabase
    .from('job_submissions')
    .update({ status: 'rejected', admin_note: body.admin_note || null })
    .eq('id', id)
    .eq('status', 'pending')
    .select()
    .maybeSingle()

  if (error) {
    console.error('Failed to reject submission:', error)
    return NextResponse.json({ error: 'Failed to reject submission' }, { status: 500 })
  }

  if (!submission) {
    // Unknown id, or already approved/rejected. 409 rather than 404: the row
    // usually does exist, it just is not pending any more.
    return NextResponse.json(
      { error: 'Submission not found or already actioned' },
      { status: 409 }
    )
  }

  // The pending count in the admin nav is cached — drop it now that this
  // submission has left the pending set.
  revalidateTag(SUBMISSIONS_TAG)

  // Notify the HR submitter their listing wasn't approved (non-blocking, never silent)
  const emailResult = await sendEmail(
    {
      from: 'MMSS Job Board <noreply@monashmss.com>',
      to: submission.submitter_email,
      subject: `An update on your submission: "${submission.title}"`,
      html: rejectionEmail(submission, body.admin_note),
      text: [
        `Hi ${submission.submitter_name},`,
        '',
        `Thank you for submitting "${submission.title}" at ${submission.company}.`,
        "Unfortunately we weren't able to feature this listing on the MMSS Job Board at this time.",
        // null, not '' — the filter below drops null so this line disappears
        // entirely when there is no note. An '' would survive the filter and
        // ship as a stray blank line, while '' entries elsewhere in this array
        // are deliberate paragraph breaks that must survive.
        body.admin_note ? `\nNote from our team: ${body.admin_note}\n` : null,
        'Have another role? Submit again at:',
        `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/submit`,
        '',
        `Questions? Email enquiries@monashmss.com`,
        'MMSS Job Board Team',
      ].filter(l => l !== null).join('\n'),
    },
    'rejection notification'
  )

  // The submission is rejected either way — but the admin needs to know if the
  // submitter was never told, so they can follow up manually.
  return NextResponse.json({
    success: true,
    email_sent: emailResult.ok,
    email_error: emailResult.ok ? undefined : emailResult.error,
  })
}
