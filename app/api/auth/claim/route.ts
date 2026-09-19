import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ensureAdminAccess } from '@/lib/admin-access'

/**
 * POST /api/auth/claim
 *
 * Reconcile the signed-in user against the email-keyed grants and report
 * whether they hold admin access.
 *
 * The password login path needs the same reconciliation the OAuth callback
 * does — an invited member who chooses the password form rather than the
 * Google button has their grant on their email address, not on their user id.
 * The login page cannot do this itself: reading admin_invites and writing
 * admin_users both require the service-role client, which never reaches the
 * browser. So the page signs in, then calls this.
 *
 * Takes no body. The identity is the session cookie, never a claimed id.
 */
export async function POST() {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  const access = await ensureAdminAccess(createAdminClient(), user)

  if (!access.granted) {
    return NextResponse.json({ granted: false }, { status: 403 })
  }

  return NextResponse.json({ granted: true })
}
