import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail, type SendResult } from '@/lib/email'
import { adminAccessEmail } from '@/lib/email-templates'

/**
 * Invite and password-reset links for admin accounts.
 *
 * Supabase's own mailer cannot be used for these. A link that Supabase mints on
 * the server (inviteUserByEmail, or resetPasswordForEmail from a server client)
 * lands with the session in a `#access_token=` fragment, and the browser client
 * from @supabase/ssr runs the PKCE flow, which rejects a fragment outright. The
 * reset page then fell back to whichever account the browser was already
 * signed in to -- so an invite for a student address offered to set the
 * password of mmss@monashclubs.org instead, and the invitee could never set one
 * at all.
 *
 * So the link is generated here, without sending, and points at our own
 * /admin/confirm page with the hashed token. The server verifies that token,
 * which replaces whatever session the browser held with the invitee's own.
 * Sending through Resend also takes Supabase's mailer rate limit out of the
 * picture.
 */

export type AdminAuthLinkType = 'invite' | 'recovery'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

/** Narrow an untrusted value from a URL or form to a link type we issue. */
export function parseAdminAuthLinkType(value: unknown): AdminAuthLinkType | null {
  return value === 'invite' || value === 'recovery' ? value : null
}

export function buildAuthConfirmUrl(
  appUrl: string,
  tokenHash: string,
  type: AdminAuthLinkType
): string {
  const url = new URL('/admin/confirm', appUrl)
  url.searchParams.set('token_hash', tokenHash)
  url.searchParams.set('type', type)
  return url.toString()
}

/**
 * Generate a one-time link for `email` and send it.
 *
 * An `invite` creates the auth account if it does not exist yet, exactly as
 * inviteUserByEmail did; it fails for an address that already has one, so
 * callers send `recovery` to existing accounts. Must be called with a
 * service-role client.
 */
export async function sendAdminAuthLink(
  adminClient: SupabaseClient,
  email: string,
  type: AdminAuthLinkType
): Promise<SendResult> {
  const { data, error } = await adminClient.auth.admin.generateLink({ type, email })
  const tokenHash = data?.properties?.hashed_token

  if (error || !tokenHash) {
    const message = error?.message ?? 'No token returned'
    console.error(`Admin ${type} link could not be generated:`, message)
    return { ok: false, error: message }
  }

  const link = buildAuthConfirmUrl(APP_URL, tokenHash, type)

  return sendEmail(
    {
      from: 'MMSS Job Board <noreply@monashmss.com>',
      to: email,
      subject:
        type === 'invite'
          ? "You've been invited to the MMSS Job Board admin"
          : 'Reset your MMSS Job Board admin password',
      html: adminAccessEmail(type, link),
    },
    `admin ${type} link`
  )
}
