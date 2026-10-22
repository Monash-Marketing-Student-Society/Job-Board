import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeEmail, recoveryAdminEmail } from '@/lib/admin-access'
import { sendAdminAuthLink } from '@/lib/admin-auth-links'
import { allowPasswordResetRequest } from '@/lib/rate-limit'

/**
 * POST /api/auth/forgot-password
 *
 * "Forgot password?" on the admin login page. It used to call Supabase's
 * resetPasswordForEmail from the browser, whose PKCE link only works in the
 * browser that asked for it: request on a laptop, open the email on a phone,
 * and the link was dead. This sends the same /admin/confirm link that invites
 * and admin-sent resets use, which works on any device.
 *
 * Only accounts that hold admin access get an email, and the response is the
 * same either way, so the form cannot be used to find out who is an admin or
 * to send mail to arbitrary addresses.
 */

const USER_PAGE_SIZE = 1000

const bodySchema = z.object({
  email: z.string().trim().min(3).max(254).email(),
})

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 })
  }

  const adminClient = createAdminClient()

  if (!(await allowPasswordResetRequest(adminClient, request))) {
    return NextResponse.json(
      { error: 'Too many reset requests. Try again in an hour.' },
      { status: 429 }
    )
  }

  const email = normalizeEmail(parsed.data.email)

  const { data: list } = await adminClient.auth.admin.listUsers({
    page: 1,
    perPage: USER_PAGE_SIZE,
  })
  const account = list?.users.find((user) => user.email && normalizeEmail(user.email) === email)

  if (account) {
    const { data: adminRow } = await adminClient
      .from('admin_users')
      .select('is_admin')
      .eq('id', account.id)
      .maybeSingle()

    const isAdmin =
      Boolean((adminRow as { is_admin: boolean } | null)?.is_admin) ||
      email === (await recoveryAdminEmail(adminClient))

    if (isAdmin) await sendAdminAuthLink(adminClient, email, 'recovery')
  }

  return NextResponse.json({ success: true })
}
