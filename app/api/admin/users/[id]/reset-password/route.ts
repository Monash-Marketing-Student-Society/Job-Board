import { NextResponse } from 'next/server'
import { isCurrentUserAdmin } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendAdminAuthLink } from '@/lib/admin-auth-links'

/**
 * POST /api/admin/users/[id]/reset-password
 *
 * Send a password-reset link to another admin. Deliberately the only
 * password-setting action an admin can take on someone else's account: it puts
 * the new password in the account holder's hands, where a password typed into
 * this dashboard and relayed over chat never is.
 *
 * The link goes through /admin/confirm to /admin/reset-password, the page the
 * self-serve "Forgot password?" flow on the login screen also ends on.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  if (!(await isCurrentUserAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const adminClient = createAdminClient()
  const { data: target } = await adminClient.auth.admin.getUserById(id)
  const email = target.user?.email

  if (!email) {
    return NextResponse.json({ error: 'That account has no email address' }, { status: 400 })
  }

  const sent = await sendAdminAuthLink(adminClient, email, 'recovery')

  if (!sent.ok) {
    return NextResponse.json(
      { error: 'Could not send the reset email. Try again shortly.' },
      { status: 502 }
    )
  }

  return NextResponse.json({ success: true, email })
}
