import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email'
import { allowSubmission } from '@/lib/rate-limit'
import { PARTNERSHIPS_EMAIL } from '@/lib/utils'
import { detectAts } from '@/lib/sync/detect-ats'
import { sourceRequestSchema } from '@/lib/sync/source-requests'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

/**
 * POST /api/feed-request — "List your roles with MMSS". Public and
 * unauthenticated, writing through the service role, so (as with
 * /api/submit-job) the schema is the field allowlist and the same per-IP
 * rate limit applies. Nothing is read from the employer's feed here; an
 * admin approves the request, which probes the feed and creates the source.
 */
export async function POST(request: Request) {
  const raw = await request.json().catch(() => null)
  const parsed = sourceRequestSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }
  const fields = parsed.data

  const adminClient = createAdminClient()
  if (!(await allowSubmission(adminClient, request))) {
    return NextResponse.json(
      { error: 'Too many requests from this network. Please try again in an hour.' },
      { status: 429 }
    )
  }

  const ats = detectAts(fields.careers_url)
  const { error } = await adminClient.from('source_requests').insert({
    company_name: fields.company_name,
    contact_name: fields.contact_name,
    contact_email: fields.contact_email,
    careers_url: fields.careers_url,
    detected_vendor: ats?.vendor ?? null,
    detected_endpoint: ats?.endpoint ?? null,
    consent_confirmed: true,
  })
  if (error) {
    console.error('Failed to save feed request:', error)
    return NextResponse.json({ error: 'Failed to save your request' }, { status: 500 })
  }

  const automatic = ats !== null
  // Non-blocking, like the submission emails: the request is saved either way.
  const [confirmResult] = await Promise.all([
    sendEmail(
      {
        from: 'MMSS Job Board <noreply@monashmss.com>',
        to: fields.contact_email,
        subject: `Request received: listing ${fields.company_name}'s roles on the MMSS Job Board`,
        text: [
          `Hi ${fields.contact_name},`,
          '',
          `Thanks for asking us to list ${fields.company_name}'s roles on the MMSS Job Board.`,
          automatic
            ? 'We can read your job site automatically. Once our team approves the request, new roles will appear for Monash marketing students after a quick review, each linking to your own application page.'
            : 'Our team will look at your careers page and be in touch about the best way to list your roles.',
          '',
          `Careers page: ${fields.careers_url}`,
          '',
          `You can withdraw this at any time by emailing ${PARTNERSHIPS_EMAIL}.`,
        ].join('\n'),
      },
      'feed request confirmation'
    ),
    sendEmail(
      {
        from: 'MMSS Job Board <noreply@monashmss.com>',
        to: PARTNERSHIPS_EMAIL,
        subject: `Feed request: ${fields.company_name}`,
        text: [
          `${fields.company_name} asked to have its roles listed automatically.`,
          '',
          `Contact:      ${fields.contact_name} (${fields.contact_email})`,
          `Careers page: ${fields.careers_url}`,
          `Job system:   ${ats ? `${ats.vendor} (can be read automatically)` : 'not recognised (follow up by hand)'}`,
          '',
          `Review: ${APP_URL}/admin/sources`,
        ].join('\n'),
      },
      'feed request notification'
    ),
  ])

  return NextResponse.json({ success: true, automatic, confirmation_email_sent: confirmResult.ok })
}
