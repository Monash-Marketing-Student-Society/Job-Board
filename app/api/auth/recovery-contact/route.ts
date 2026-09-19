import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { recoveryAdminEmail } from '@/lib/admin-access'

/**
 * GET /api/auth/recovery-contact
 *
 * Public, and deliberately narrow: it returns the recovery address and nothing
 * else. The sign-in page needs it while signed out, to tell a locked-out
 * committee member where to turn, and that is the whole reason it exists.
 *
 * Opening `admin_settings` to anon through RLS would have been less code and
 * worse, because every setting added to that table later would have inherited
 * the exposure without anyone revisiting the decision.
 */
export async function GET() {
  const email = await recoveryAdminEmail(createAdminClient())
  return NextResponse.json({ email })
}
