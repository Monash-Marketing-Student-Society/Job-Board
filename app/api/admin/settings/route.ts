import { NextResponse } from 'next/server'
import { z } from 'zod'
import { isCurrentUserAdmin, getUser } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeEmail, recoveryAdminEmail, RECOVERY_ADMIN_SETTING } from '@/lib/admin-access'

const settingsSchema = z.object({
  recoveryAdminEmail: z.string().trim().min(3).max(254).email(),
})

/** GET /api/admin/settings — the dashboard's configurable values. */
export async function GET() {
  if (!(await isCurrentUserAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const adminClient = createAdminClient()
  return NextResponse.json({
    data: { recoveryAdminEmail: await recoveryAdminEmail(adminClient) },
  })
}

/**
 * PUT /api/admin/settings
 *
 * Changing the recovery admin hands the last way into the dashboard to a
 * different mailbox, so it is worth being slow about: the new address is
 * granted admin immediately, and the old one keeps whatever ordinary grant it
 * had. Nothing is revoked here. Removing the previous holder is a separate,
 * deliberate act on the admin list, which means a typo in this field cannot
 * lock the committee out on its own.
 */
export async function PUT(request: Request) {
  if (!(await isCurrentUserAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const parsed = settingsSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 })
  }

  const email = normalizeEmail(parsed.data.recoveryAdminEmail)
  const adminClient = createAdminClient()
  const actor = await getUser()

  const { error } = await adminClient.from('admin_settings').upsert(
    {
      key: RECOVERY_ADMIN_SETTING,
      value: email,
      updated_at: new Date().toISOString(),
      updated_by: actor?.id ?? null,
    },
    { onConflict: 'key' }
  )

  if (error) {
    return NextResponse.json({ error: 'Failed to save the recovery admin' }, { status: 500 })
  }

  // If that mailbox already has an account, give it the grant now rather than
  // waiting for a sign-in that may only happen in an emergency.
  const { data: list } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const existing = list?.users.find((u) => u.email && normalizeEmail(u.email) === email)
  if (existing) {
    await adminClient.from('admin_users').upsert({ id: existing.id, is_admin: true }, { onConflict: 'id' })
  }

  return NextResponse.json({ success: true, recoveryAdminEmail: email })
}
