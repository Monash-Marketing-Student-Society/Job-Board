/**
 * MMSS Job Board — branded HTML email templates
 *
 * Design reference: MMSS Sponsorship Prospectus 2026
 * Fonts:
 *   Header H1 + body subheadings + buttons → Montserrat
 *   Section labels (subheadings) → Proxima Nova (falls back to Nunito Sans)
 *   Job detail rows + body paragraphs + numbered steps → Roboto
 *   Footer → Inter throughout
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
const CONTACT_EMAIL = 'enquiries@monashmss.com'
const LOGO_URL = 'https://olyzdpqfecawcueffrsq.supabase.co/storage/v1/object/public/mmss-email-assets/MMSS%20Hero%20Logo%20(white).png'

// Supabase-hosted brand image assets
const HEADER_IMG = 'https://olyzdpqfecawcueffrsq.supabase.co/storage/v1/object/public/mmss-email-assets/mmss-job-board-header%20(2).png'
const FOOTER_IMG = 'https://olyzdpqfecawcueffrsq.supabase.co/storage/v1/object/public/mmss-email-assets/mmss-job-board-footer%20(3).png'

// ─── Shared primitives ───────────────────────────────────────────────────────

function detailRow(label: string, value: string | null | undefined): string {
  if (!value) return ''
  return `
    <tr>
      <td style="padding:10px 0;color:#7c5cbf;font-size:14px;font-family:'Roboto',Arial,sans-serif;width:120px;vertical-align:top;">${label}</td>
      <td style="padding:10px 0;color:#1a1a2e;font-size:14px;font-family:'Roboto',Arial,sans-serif;vertical-align:top;">${value}</td>
    </tr>`
}

function sectionLabel(text: string): string {
  return `<p style="margin:0 0 18px;color:#5b2d8e;font-size:11px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;font-family:'Proxima Nova','Nunito Sans',Arial,sans-serif;">${text}</p>`
}

function jobBanner(title: string, company: string): string {
  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1fa;border-radius:8px;margin-bottom:24px;">
      <tr>
        <td style="padding:18px 20px;">
          <p style="margin:0;font-size:19px;font-weight:700;color:#1a1a2e;font-family:'Montserrat',Arial,sans-serif;">${title}</p>
          <p style="margin:6px 0 0;font-size:14px;color:#5b2d8e;font-family:'Proxima Nova','Nunito Sans',Arial,sans-serif;font-weight:600;">${company}</p>
        </td>
      </tr>
    </table>`
}

function ctaButton(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:#3d1472;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:14px 28px;border-radius:8px;font-family:'Montserrat',Arial,sans-serif;letter-spacing:0.3px;">${label} →</a>`
}

function emailHeader(title: string, subtitle: string): string {
  return `
    <tr>
      <td style="background-color:#3d1472;background-image:url('${HEADER_IMG}');background-repeat:no-repeat;background-size:cover;background-position:center top;border-radius:12px 12px 0 0;padding:28px 40px 36px;">
        <!-- Logo row -->
        <table cellpadding="0" cellspacing="0">
          <tr>
            <td style="vertical-align:middle;">
              <img src="${LOGO_URL}" alt="MMSS" width="36" height="36" style="display:block;" />
            </td>
            <td style="padding-left:10px;vertical-align:middle;">
              <p style="margin:0;color:rgba(255,255,255,0.80);font-size:10px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;font-family:'Montserrat',Arial,sans-serif;">Monash Marketing Students' Society</p>
            </td>
          </tr>
        </table>
        <!-- Heading -->
        <h1 style="margin:28px 0 0;color:#ffffff;font-size:30px;font-weight:800;line-height:1.15;font-family:'Montserrat',Arial,sans-serif;">${title}</h1>
        <p style="margin:14px 0 0;color:rgba(255,255,255,0.88);font-size:15px;line-height:1.6;font-family:'Montserrat',Arial,sans-serif;font-weight:400;">${subtitle}</p>
      </td>
    </tr>`
}

function emailFooter(): string {
  return `
    <tr>
      <td style="background-color:#3d1472;background-image:url('${FOOTER_IMG}');background-repeat:no-repeat;background-size:cover;background-position:center;border-radius:0 0 12px 12px;padding:24px 40px 28px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="vertical-align:top;">
              <p style="margin:0 0 2px;color:#ffffff;font-size:14px;font-weight:700;font-family:'Inter',Arial,sans-serif;">MMSS Job Board</p>
              <p style="margin:0;color:rgba(255,255,255,0.55);font-size:12px;font-family:'Inter',Arial,sans-serif;">Monash Marketing Students' Society</p>
            </td>
            <td align="right" style="vertical-align:top;">
              <a href="mailto:${CONTACT_EMAIL}" style="color:rgba(255,255,255,0.65);font-size:12px;font-family:'Inter',Arial,sans-serif;text-decoration:none;">${CONTACT_EMAIL}</a>
            </td>
          </tr>
          <tr>
            <td colspan="2" style="padding-top:14px;">
              <p style="margin:0;color:rgba(255,255,255,0.45);font-size:11px;font-family:'Inter',Arial,sans-serif;line-height:1.5;">
                Questions? Reply to this email or reach us at <a href="mailto:${CONTACT_EMAIL}" style="color:rgba(255,255,255,0.70);text-decoration:none;font-weight:600;">${CONTACT_EMAIL}</a>.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>`
}

function wrap(rows: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800&family=Roboto:wght@400;500&family=Inter:wght@400;500;600;700&family=Nunito+Sans:wght@600;700&display=swap" rel="stylesheet" />
</head>
<body style="margin:0;padding:0;background:#f0ecf8;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0ecf8;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
          ${rows}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

// ─── Shared type ─────────────────────────────────────────────────────────────

export interface SubmissionData {
  submitter_name: string
  submitter_email: string
  title: string
  company: string
  location?: string | null
  job_type?: string | null
  work_mode?: string | null
  closing_at?: string | null
  tags?: string[] | string | null
  url: string
  edit_token: string
}

function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
  } catch {
    return iso
  }
}

function capitalize(s: string | null | undefined): string | null {
  if (!s) return null
  return s.charAt(0).toUpperCase() + s.slice(1).replace('-', ' ')
}

// ─── Template 1: Submission confirmation ────────────────────────────────────

export function submissionConfirmationEmail(data: SubmissionData): string {
  const editLink = `${APP_URL}/submit/edit?token=${data.edit_token}`

  return wrap(`
    ${emailHeader(
      'Submission Received!',
      `Hi ${data.submitter_name}, thank you for submitting to the MMSS Job Board. Our team will review your listing within 2–3 business days.`
    )}

    <!-- Summary card -->
    <tr>
      <td style="background:#ffffff;padding:32px 40px 0;">
        ${sectionLabel('Your Submission Summary')}
        ${jobBanner(data.title, data.company)}
        <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e8e0f5;border-bottom:1px solid #e8e0f5;">
          ${detailRow('Location', data.location)}
          ${detailRow('Job type', capitalize(data.job_type))}
          ${detailRow('Work mode', capitalize(data.work_mode))}
          ${detailRow('Closing date', formatDate(data.closing_at))}
        </table>
      </td>
    </tr>

    <!-- Edit CTA -->
    <tr>
      <td style="background:#ffffff;padding:28px 40px 36px;">
        <p style="margin:0 0 6px;font-size:15px;font-weight:700;color:#1a1a2e;font-family:'Montserrat',Arial,sans-serif;">Need to make changes?</p>
        <p style="margin:0 0 20px;font-size:14px;color:#6b6b8a;font-family:'Roboto',Arial,sans-serif;line-height:1.55;">You can edit your submission any time before our team reviews it.</p>
        ${ctaButton(editLink, 'Edit My Submission')}
      </td>
    </tr>

    <!-- What happens next -->
    <tr>
      <td style="background:#f8f5ff;border-top:1px solid #e8e0f5;padding:28px 40px 32px;">
        ${sectionLabel('What Happens Next')}
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:6px 0;vertical-align:top;width:28px;">
              <div style="width:22px;height:22px;background:#5b2d8e;border-radius:50%;text-align:center;line-height:22px;font-size:11px;font-weight:700;color:#fff;font-family:'Roboto',Arial,sans-serif;">1</div>
            </td>
            <td style="padding:6px 0 6px 12px;font-size:14px;color:#3a3a5c;font-family:'Roboto',Arial,sans-serif;line-height:1.55;">Our team reviews your listing to ensure it's a great fit for MMSS members.</td>
          </tr>
          <tr>
            <td style="padding:6px 0;vertical-align:top;width:28px;">
              <div style="width:22px;height:22px;background:#5b2d8e;border-radius:50%;text-align:center;line-height:22px;font-size:11px;font-weight:700;color:#fff;font-family:'Roboto',Arial,sans-serif;">2</div>
            </td>
            <td style="padding:6px 0 6px 12px;font-size:14px;color:#3a3a5c;font-family:'Roboto',Arial,sans-serif;line-height:1.55;">Once approved, your listing goes live on the MMSS Job Board — where students can now see and apply to your role.</td>
          </tr>
          <tr>
            <td style="padding:6px 0;vertical-align:top;width:28px;">
              <div style="width:22px;height:22px;background:#5b2d8e;border-radius:50%;text-align:center;line-height:22px;font-size:11px;font-weight:700;color:#fff;font-family:'Roboto',Arial,sans-serif;">3</div>
            </td>
            <td style="padding:6px 0 6px 12px;font-size:14px;color:#3a3a5c;font-family:'Roboto',Arial,sans-serif;line-height:1.55;">You'll receive an email confirmation the moment your listing is published.</td>
          </tr>
        </table>
      </td>
    </tr>

    ${emailFooter()}
  `)
}

// ─── Template 2: Listing approved / live ────────────────────────────────────

export function approvalEmail(data: SubmissionData): string {
  return wrap(`
    ${emailHeader(
      "You're Live on the Job Board! 🎉",
      `Hi ${data.submitter_name}, great news. Your listing has been reviewed and approved.`
    )}

    <!-- Live listing card -->
    <tr>
      <td style="background:#ffffff;padding:32px 40px 0;">
        ${sectionLabel('Your Live Listing')}
        ${jobBanner(data.title, data.company)}
        <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e8e0f5;border-bottom:1px solid #e8e0f5;">
          ${detailRow('Location', data.location)}
          ${detailRow('Job type', capitalize(data.job_type))}
          ${detailRow('Work mode', capitalize(data.work_mode))}
          ${detailRow('Closing date', formatDate(data.closing_at))}
        </table>
      </td>
    </tr>

    <!-- View CTA -->
    <tr>
      <td style="background:#ffffff;padding:28px 40px 36px;">
        <p style="margin:0 0 6px;font-size:15px;font-weight:700;color:#1a1a2e;font-family:'Montserrat',Arial,sans-serif;">View your listing on the board</p>
        <p style="margin:0 0 20px;font-size:14px;color:#6b6b8a;font-family:'Roboto',Arial,sans-serif;line-height:1.55;">Students can now see and apply to your role. Share the board link with your networks!</p>
        ${ctaButton(APP_URL, 'View Job Board')}
      </td>
    </tr>

    <!-- Thank you -->
    <tr>
      <td style="background:#f8f5ff;border-top:1px solid #e8e0f5;padding:28px 40px 32px;">
        ${sectionLabel('Thank You')}
        <p style="margin:0;font-size:14px;color:#3a3a5c;font-family:'Roboto',Arial,sans-serif;line-height:1.6;">
          Thank you for choosing to connect with Monash marketing students through the MMSS Job Board.
          If you'd like to feature another role in the future, simply visit
          <a href="${APP_URL}/submit" style="color:#5b2d8e;text-decoration:none;">${APP_URL}/submit</a>.
        </p>
      </td>
    </tr>

    ${emailFooter()}
  `)
}

// ─── Template 3: Listing rejected ───────────────────────────────────────────

export function rejectionEmail(data: SubmissionData, adminNote?: string | null): string {
  return wrap(`
    ${emailHeader(
      'An Update on Your Submission',
      `Hi ${data.submitter_name}, thank you for your patience. We've reviewed your submission and have an update for you below.`
    )}

    <!-- Submission reference -->
    <tr>
      <td style="background:#ffffff;padding:32px 40px 0;">
        ${sectionLabel('Submission Reviewed')}
        ${jobBanner(data.title, data.company)}

        <!-- Status pill -->
        <table cellpadding="0" cellspacing="0" style="margin-bottom:22px;">
          <tr>
            <td style="background:#fff0f0;border:1px solid #f5c6c6;border-radius:20px;padding:6px 16px;">
              <p style="margin:0;font-size:12px;font-weight:700;color:#c0392b;font-family:'Roboto',Arial,sans-serif;letter-spacing:0.5px;">Not approved at this time</p>
            </td>
          </tr>
        </table>

        ${adminNote ? `
        <!-- Reviewer note -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#fdf8f0;border-left:3px solid #e8a020;border-radius:0 6px 6px 0;margin-bottom:22px;">
          <tr>
            <td style="padding:14px 18px;">
              <p style="margin:0 0 5px;font-size:10px;font-weight:700;color:#a06010;font-family:'Proxima Nova','Nunito Sans',Arial,sans-serif;text-transform:uppercase;letter-spacing:1.5px;">Reviewer note</p>
              <p style="margin:0;font-size:14px;color:#4a3a10;font-family:'Roboto',Arial,sans-serif;line-height:1.55;">${adminNote}</p>
            </td>
          </tr>
        </table>` : ''}

        <p style="margin:0;font-size:14px;color:#3a3a5c;font-family:'Roboto',Arial,sans-serif;line-height:1.6;">
          Unfortunately we weren't able to feature this listing on the MMSS Job Board at this time.
          We appreciate your interest in connecting with Monash students.
        </p>
      </td>
    </tr>

    <!-- Resubmit CTA -->
    <tr>
      <td style="background:#ffffff;padding:28px 40px 36px;">
        <p style="margin:0 0 6px;font-size:15px;font-weight:700;color:#1a1a2e;font-family:'Montserrat',Arial,sans-serif;">Have another role that might be a better fit?</p>
        <p style="margin:0 0 20px;font-size:14px;color:#6b6b8a;font-family:'Roboto',Arial,sans-serif;line-height:1.55;">We welcome future submissions. Reply to this email if you have questions about our guidelines.</p>
        ${ctaButton(`${APP_URL}/submit`, 'Submit a New Listing')}
      </td>
    </tr>

    <!-- Thank you -->
    <tr>
      <td style="background:#f8f5ff;border-top:1px solid #e8e0f5;padding:28px 40px 32px;">
        ${sectionLabel('Thank You')}
        <p style="margin:0;font-size:14px;color:#3a3a5c;font-family:'Roboto',Arial,sans-serif;line-height:1.6;">
          Thank you for considering the MMSS Job Board as a platform to connect with Monash marketing students.
          We hope to work with you in the future.
        </p>
      </td>
    </tr>

    ${emailFooter()}
  `)
}

// ─── Template 4: Sync run digest (internal, to partnerships@) ───────────────

/**
 * Escapes text for an HTML body. The other templates interpolate values an
 * admin or employer typed into a form; the digest carries titles scraped from
 * third-party career sites, so it must never trust them as markup.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export interface SyncDigestData {
  queueUrl: string
  /** e.g. "Wed, 30 Sept" -- the run's date in Melbourne time. */
  runLabel: string
  held: Array<{ title: string; company: string; location: string | null; source: string; reasons: string[] }>
  sources: Array<{ name: string; seen: number; held: number; rejected: number; deduped: number; created: number }>
  problems: Array<{ name: string; issue: string }>
}

export function syncDigestEmail(data: SyncDigestData): string {
  const heldRows = data.held
    .map(
      (job) => `
        <tr>
          <td style="padding:14px 0;border-bottom:1px solid #e8e0f5;">
            <p style="margin:0;font-size:15px;font-weight:700;color:#1a1a2e;font-family:'Montserrat',Arial,sans-serif;">${escapeHtml(job.title)}</p>
            <p style="margin:4px 0 0;font-size:13px;color:#5b2d8e;font-family:'Roboto',Arial,sans-serif;">${escapeHtml(
              [job.company, job.location, job.source].filter(Boolean).join(' · ')
            )}</p>
            <p style="margin:6px 0 0;font-size:12px;color:#8a6d1a;font-family:'Roboto',Arial,sans-serif;">Held: ${escapeHtml(job.reasons.join(', '))}</p>
          </td>
        </tr>`
    )
    .join('')

  const problemRows = data.problems
    .map(
      (p) => `
        <tr>
          <td style="padding:10px 0;color:#1a1a2e;font-size:14px;font-family:'Roboto',Arial,sans-serif;width:160px;vertical-align:top;font-weight:600;">${escapeHtml(p.name)}</td>
          <td style="padding:10px 0;color:#b42318;font-size:14px;font-family:'Roboto',Arial,sans-serif;vertical-align:top;">${escapeHtml(p.issue)}</td>
        </tr>`
    )
    .join('')

  const sourceRows = data.sources
    .map(
      (s) => `
        <tr>
          <td style="padding:8px 0;color:#1a1a2e;font-size:13px;font-family:'Roboto',Arial,sans-serif;">${escapeHtml(s.name)}</td>
          <td style="padding:8px 0;color:#6b6b8a;font-size:13px;font-family:'Roboto',Arial,sans-serif;text-align:right;">${s.seen} seen · ${s.held} held · ${s.created} published · ${s.rejected} off-target · ${s.deduped} duplicate</td>
        </tr>`
    )
    .join('')

  return wrap(`
    ${emailHeader(
      data.held.length > 0 ? `${data.held.length} synced job${data.held.length === 1 ? '' : 's'} to review` : 'Job sync needs a look',
      `Nightly sync, ${escapeHtml(data.runLabel)}. Nothing held here is visible to students until someone approves it.`
    )}

    ${
      data.held.length > 0
        ? `<tr>
      <td style="background:#ffffff;padding:32px 40px 8px;">
        ${sectionLabel('Held for review')}
        <table width="100%" cellpadding="0" cellspacing="0">${heldRows}</table>
      </td>
    </tr>`
        : ''
    }

    ${
      data.problems.length > 0
        ? `<tr>
      <td style="background:#ffffff;padding:28px 40px 8px;">
        ${sectionLabel('Sources that need attention')}
        <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e8e0f5;border-bottom:1px solid #e8e0f5;">${problemRows}</table>
      </td>
    </tr>`
        : ''
    }

    <tr>
      <td style="background:#ffffff;padding:28px 40px 36px;">
        ${ctaButton(data.queueUrl, 'Open the review queue')}
      </td>
    </tr>

    <tr>
      <td style="background:#f8f5ff;border-top:1px solid #e8e0f5;border-radius:0 0 12px 12px;padding:24px 40px 28px;">
        ${sectionLabel('This run')}
        <table width="100%" cellpadding="0" cellspacing="0">${sourceRows}</table>
      </td>
    </tr>
  `)
}
