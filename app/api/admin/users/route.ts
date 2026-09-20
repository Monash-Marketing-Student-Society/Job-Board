import { NextResponse } from 'next/server'
import { z } from 'zod'
import { isCurrentUserAdmin, getUser } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  normalizeEmail,
  autoApproveDomains,
  emailMatchesAutoApprovedDomain,
  recoveryAdminEmail,
} from '@/lib/admin-access'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

/**
 * Nobody paginates a committee. Supabase's listUsers caps a page at 1000, and
 * one call at that size is both cheaper and more complete than the getUserById
 * per admin row this route used to make — it is the only way to learn which
 * providers an account has linked.
 */
const USER_PAGE_SIZE = 1000

const inviteSchema = z.object({
  email: z.string().trim().min(3).max(254).email(),
})

/**
 * The providers linked to an account.
 *
 * Read from app_metadata rather than `identities`, because listUsers does not
 * populate `identities` at all — only getUserById does, and going back for it
 * per row would put the roster's page load back on an N+1. app_metadata is
 * maintained by Supabase on link and unlink, so it is the accurate field that
 * one call can actually see.
 */
function providersOf(authUser: { app_metadata?: Record<string, unknown> } | undefined): string[] {
  const metadata = authUser?.app_metadata
  if (!metadata) return []
  const providers = metadata.providers
  if (Array.isArray(providers)) return providers.filter((p): p is string => typeof p === 'string')
  return typeof metadata.provider === 'string' ? [metadata.provider] : []
}

export interface AdminAccountRow {
  id: string
  email: string | null
  createdAt: string
  /** 'google', 'email', … — every identity linked to this account. */
  providers: string[]
  lastSignInAt: string | null
  emailConfirmed: boolean
  /** True when the grant came from a domain rule rather than an invitation. */
  viaDomain: boolean
  /** The address that can always get back in. Cannot be removed from the UI. */
  isRecoveryAdmin: boolean
}

export interface AdminInviteRow {
  id: string
  email: string
  createdAt: string
  claimedAt: string | null
}

/**
 * GET /api/admin/users
 *
 * The admin roster: accounts that currently hold access, plus invitations that
 * nobody has signed in against yet. Emails, linked providers and last-sign-in
 * times live in auth.users, which is only reachable with the service-role
 * client, so this cannot be a client-side Supabase call.
 */
export async function GET() {
  if (!(await isCurrentUserAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const adminClient = createAdminClient()

  const [{ data: adminRows, error: adminError }, { data: inviteRows }, { data: authList }] =
    await Promise.all([
      adminClient
        .from('admin_users')
        .select('id, is_admin, created_at')
        .eq('is_admin', true)
        .order('created_at', { ascending: true }),
      adminClient
        .from('admin_invites')
        .select('id, email, created_at, claimed_at')
        .order('created_at', { ascending: true }),
      adminClient.auth.admin.listUsers({ page: 1, perPage: USER_PAGE_SIZE }),
    ])

  if (adminError || !adminRows) {
    return NextResponse.json({ error: 'Failed to load admin users' }, { status: 500 })
  }

  const authUsers = new Map(authList?.users.map((user) => [user.id, user]) ?? [])
  const invitesFromDb = (inviteRows ?? []) as {
    id: string
    email: string
    created_at: string
    claimed_at: string | null
  }[]
  const invitedEmails = new Set(invitesFromDb.map((row) => normalizeEmail(row.email)))
  const domains = autoApproveDomains()
  const recoveryEmail = await recoveryAdminEmail(adminClient)

  const admins: AdminAccountRow[] = (
    adminRows as { id: string; created_at: string }[]
  ).map((row) => {
    const authUser = authUsers.get(row.id)
    const email = authUser?.email ?? null
    return {
      id: row.id,
      email,
      createdAt: row.created_at,
      providers: providersOf(authUser),
      lastSignInAt: authUser?.last_sign_in_at ?? null,
      emailConfirmed: Boolean(authUser?.email_confirmed_at),
      // Whether *this* address is covered by a domain rule, not merely whether
      // some rule exists. The previous test was `domains.length > 0`, which
      // badged every uninvited admin as Domain the moment any domain was
      // configured -- so mmss@monashclubs.org was labelled domain-approved
      // under a list containing only monashmss.com.
      //
      // It read as a cosmetic slip and was not: the removal dialog keys its
      // "they will regain access on their next sign-in" warning off this flag,
      // while the DELETE route decides the real answer with
      // emailMatchesAutoApprovedDomain. The two disagreed, so the warning fired
      // for people the server would have removed permanently. Both now ask the
      // same question of the same function.
      viaDomain: Boolean(
        email &&
          emailMatchesAutoApprovedDomain(email, domains) &&
          !invitedEmails.has(normalizeEmail(email))
      ),
      isRecoveryAdmin: Boolean(email && normalizeEmail(email) === recoveryEmail),
    }
  })

  // An invitation stops being interesting the moment its holder appears in the
  // roster above, so only the outstanding ones are reported.
  const adminEmails = new Set(
    admins.map((admin) => (admin.email ? normalizeEmail(admin.email) : '')).filter(Boolean)
  )
  const invites: AdminInviteRow[] = invitesFromDb
    .filter((row) => !adminEmails.has(normalizeEmail(row.email)))
    .map((row) => ({
      id: row.id,
      email: row.email,
      createdAt: row.created_at,
      claimedAt: row.claimed_at,
    }))

  return NextResponse.json({
    data: { admins, invites, autoApproveDomains: domains, recoveryAdminEmail: recoveryEmail },
  })
}

/**
 * POST /api/admin/users
 *
 * Invite someone by email. No password is set here: the invitee either signs in
 * with Google or follows the emailed link to choose their own. An admin typing
 * a password on someone else's behalf means that password travels to them
 * through some other channel, which is the weakest link in the whole flow.
 *
 * The grant is written to admin_invites before the email is sent, and the
 * response distinguishes the two, because the grant is what actually matters:
 * if Supabase's mailer is rate-limited the invitee can still sign in with
 * Google, and the admin needs to be told that rather than shown a failure.
 */
export async function POST(request: Request) {
  if (!(await isCurrentUserAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const parsed = inviteSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 })
  }

  const email = normalizeEmail(parsed.data.email)
  const adminClient = createAdminClient()
  const actor = await getUser()

  const { error: inviteError } = await adminClient
    .from('admin_invites')
    .upsert({ email, invited_by: actor?.id ?? null }, { onConflict: 'email' })

  if (inviteError) {
    return NextResponse.json({ error: 'Failed to record the invitation' }, { status: 500 })
  }

  // If the account already exists — a past admin who was removed, or someone
  // who has signed in with Google and been turned away — the grant can be
  // applied now instead of waiting for another sign-in.
  const { data: existingList } = await adminClient.auth.admin.listUsers({
    page: 1,
    perPage: USER_PAGE_SIZE,
  })
  const existing = existingList?.users.find(
    (user) => user.email && normalizeEmail(user.email) === email
  )

  if (existing) {
    const { error: grantError } = await adminClient
      .from('admin_users')
      .upsert({ id: existing.id, is_admin: true }, { onConflict: 'id' })

    if (grantError) {
      return NextResponse.json({ error: 'Failed to grant admin access' }, { status: 500 })
    }

    await adminClient
      .from('admin_invites')
      .update({ claimed_at: new Date().toISOString(), claimed_by: existing.id })
      .eq('email', email)
      .is('claimed_at', null)

    return NextResponse.json({ success: true, outcome: 'granted', email })
  }

  const { error: mailError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${APP_URL}/admin/reset-password`,
  })

  return NextResponse.json({
    success: true,
    outcome: mailError ? 'invited-no-email' : 'invited',
    email,
  })
}
