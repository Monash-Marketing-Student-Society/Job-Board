import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { SUBMISSIONS_TAG } from '@/lib/admin-data'
import { sendEmail } from '@/lib/email'
import { submissionConfirmationEmail } from '@/lib/email-templates'
import { toJobFunctions } from '@/lib/tags'
import { sanitizeDescription } from '@/lib/sanitize'
import { jobSubmissionSchema } from '@/lib/job-submission-schema'
import type { JobSubmission } from '@/lib/types'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
const ADMIN_EMAIL = 'partnerships@monashmss.com'
const ADMIN_BCC = ['mmss@monashclubs.org', 'club.mmss@monsu.org']

export async function POST(request: Request) {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  // This endpoint is public and unauthenticated and inserts through a
  // service-role client that bypasses RLS, so the body is the whole trust
  // boundary. The schema is the field allowlist: it keeps only what a submitter
  // owns, so `status`, `edit_token`, `admin_note`, `id` and the timestamps
  // cannot ride in on the spread below.
  const parsed = jobSubmissionSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid submission', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }
  const fields = parsed.data

  const adminClient = createAdminClient()

  // The combobox on /submit can only produce vocabulary values, but the schema
  // deliberately checks only the outer shape of `tags` — canonicalisation and
  // the count cap are re-applied here so the guarantee does not depend on which
  // client called.
  const tags = toJobFunctions(fields.tags)

  // Description is rich-text HTML and is rendered with dangerouslySetInnerHTML.
  // The render site sanitises too, which is what actually closes the hole for
  // rows already stored — this keeps what lands in the database clean in the
  // first place, so every other consumer (the admin queue, the email templates,
  // anything added later) inherits the guarantee instead of re-deriving it.
  const description = sanitizeDescription(fields.description) || null

  const { data, error } = await adminClient
    .from('job_submissions')
    .insert({ ...fields, tags: tags.length > 0 ? tags : null, description })
    .select()
    .single() as { data: JobSubmission | null; error: Error | null }

  if (error || !data) {
    console.error('Failed to insert submission:', error)
    return NextResponse.json({ error: 'Failed to save submission' }, { status: 500 })
  }

  // A new submission joins the pending set — drop the cached admin nav count.
  revalidateTag(SUBMISSIONS_TAG)

  // Send emails — failures are non-blocking, but never silent
  const editLink = `${APP_URL}/submit/edit?token=${data.edit_token}`

  const [confirmResult, adminResult] = await Promise.all([
    sendEmail(
      {
        from: 'MMSS Job Board <noreply@monashmss.com>',
        to: data.submitter_email,
        subject: `Submission received: "${data.title}" at ${data.company}`,
        html: submissionConfirmationEmail(data),
        text: [
          `Hi ${data.submitter_name},`,
          '',
          `Thank you for submitting "${data.title}" at ${data.company} to the MMSS Job Board.`,
          'Our team will review your listing within 2–3 business days.',
          '',
          `Job title:  ${data.title}`,
          `Company:    ${data.company}`,
          data.location   ? `Location:   ${data.location}`   : null,
          data.job_type   ? `Job type:   ${data.job_type}`   : null,
          data.work_mode  ? `Work mode:  ${data.work_mode}`  : null,
          data.closing_at ? `Closes:     ${data.closing_at}` : null,
          `Apply URL:  ${data.url}`,
          '',
          `Edit your submission: ${editLink}`,
          `Questions? Email ${ADMIN_EMAIL}`,
          // Drops the optional null lines above while keeping the '' entries,
          // which are deliberate paragraph breaks. filter(Boolean) removed both
          // and collapsed the whole email into one unbroken block.
        ].filter(l => l !== null).join('\n'),
      },
      'submission confirmation'
    ),
    sendEmail(
      {
        from: 'MMSS Job Board <noreply@monashmss.com>',
        to: ADMIN_EMAIL,
        bcc: ADMIN_BCC,
        subject: `New submission: ${data.title} at ${data.company}`,
        text: [
          'A new job submission is waiting for review.',
          '',
          `Job:          ${data.title} at ${data.company}`,
          `Submitted by: ${data.submitter_name} (${data.submitter_email})`,
          `Company:      ${data.submitter_company_name}`,
          `Apply URL:    ${data.url}`,
          ...(data.is_sponsored ? ['Sponsored:    requested by the submitter'] : []),
          '',
          `Review: ${APP_URL}/admin/submissions`,
        ].join('\n'),
      },
      'admin notification'
    ),
  ])

  // The submission is saved either way — but tell the submitter if we could not
  // email them, so a missing confirmation does not look like a lost submission.
  return NextResponse.json({
    success: true,
    confirmation_email_sent: confirmResult.ok,
    admin_email_sent: adminResult.ok,
  })
}
