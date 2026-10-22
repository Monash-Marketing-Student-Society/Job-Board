import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ensureAdminAccess } from '@/lib/admin-access'
import { parseAdminAuthLinkType } from '@/lib/admin-auth-links'

/**
 * POST /api/auth/confirm
 *
 * Spends the one-time token from an admin invite or reset email (posted by the
 * /admin/confirm page) and signs the browser in as that account.
 *
 * verifyOtp writes the new session over whatever cookies were already there,
 * which is the point: the browser may already be signed in as a different
 * admin, and the reset page must act on the account the email was sent to.
 * The invite is claimed here as well, so a new admin is an admin from the
 * moment they set a password rather than only after their next sign-in.
 */

function baseUrl(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL
  if (configured) return configured.replace(/\/$/, '')
  return new URL(request.url).origin
}

export async function POST(request: Request) {
  const origin = baseUrl(request)
  // 303 so the browser follows with a GET rather than re-posting the form.
  const redirect = (path: string) => NextResponse.redirect(`${origin}${path}`, 303)

  const form = await request.formData().catch(() => null)
  const tokenHash = form?.get('token_hash')
  const type = parseAdminAuthLinkType(form?.get('type'))

  if (typeof tokenHash !== 'string' || !tokenHash || !type) {
    return redirect('/admin/reset-password?link=invalid')
  }

  const supabase = await createServerClient()
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })

  if (error || !data.user) {
    return redirect('/admin/reset-password?link=invalid')
  }

  await ensureAdminAccess(createAdminClient(), data.user)

  return redirect(`/admin/reset-password?link=${type}`)
}
