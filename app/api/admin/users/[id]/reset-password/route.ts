import { NextResponse } from 'next/server'
import { isCurrentUserAdmin } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

/**
 * POST /api/admin/users/[id]/reset-password
 *
 * Send a password-reset link to another admin. Deliberately the only
 * password-setting action an admin can take on someone else's account: it puts
 * the new password in the account holder's hands, where a password typed into
 * this dashboard and relayed over chat never is.
 *
 * The link lands on /admin/reset-password, the same page the self-serve
 * "Forgot password?" flow on the login screen uses.
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

  const { error } = await adminClient.auth.resetPasswordForEmail(email, {
    redirectTo: `${APP_URL}/admin/reset-password`,
  })

  if (error) {
    // Supabase's own mailer is rate-limited, and that is the usual cause here.
    // Say so: "try again later" is actionable in a way that "failed" is not.
    return NextResponse.json(
      { error: 'Could not send the reset email. Supabase rate-limits these — try again shortly.' },
      { status: 502 }
    )
  }

  return NextResponse.json({ success: true, email })
}
