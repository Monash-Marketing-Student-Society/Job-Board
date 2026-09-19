import type { SupabaseClient, User } from '@supabase/supabase-js'

/**
 * Who is allowed into /admin, and how a grant becomes an admin_users row.
 *
 * Two ways to hold a grant:
 *
 *  1. An explicit invitation — a row in `admin_invites` keyed on the email
 *     address (0025_admin_invites.sql).
 *  2. Membership of an auto-approved email domain, listed in
 *     ADMIN_AUTO_APPROVE_DOMAINS.
 *
 * Either way the grant is only a *claim ticket*. Admin access itself still
 * lives in `admin_users`, keyed on the auth user id, because that is what
 * is_admin() and therefore every RLS policy in the database reads. The claim
 * below is the one place those two representations are reconciled, and it runs
 * on every sign-in rather than only on the first, so a committee member who
 * signs in with Google today and with a password tomorrow ends up an admin
 * under both auth identities.
 */

/** Lowercased and trimmed, matching the CHECK constraint on admin_invites.email. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/**
 * Parse ADMIN_AUTO_APPROVE_DOMAINS: a comma-separated list such as
 * "monashmss.com, monashclubs.org". Unset or empty means invite-only, which is
 * the safe default — an unconfigured deployment grants nobody anything rather
 * than everybody everything.
 */
export function parseAutoApproveDomains(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((domain) => domain.trim().toLowerCase().replace(/^@/, ''))
    // Must look like a real domain: at least two non-empty labels. A stray
    // "." or "localhost" left in the variable would otherwise sit in the list
    // as a live entry and widen the match set.
    .filter((domain) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain))
}

/**
 * Does this address sit on an auto-approved domain?
 *
 * Compares the part after the *last* "@" so that a crafted local part cannot
 * smuggle a domain in — "attacker@evil.com" must not match on a naive
 * `includes('monashmss.com')`, and "victim@monashmss.com@evil.com" must be read
 * as the evil.com address it actually is.
 */
export function emailMatchesAutoApprovedDomain(email: string, domains: string[]): boolean {
  if (domains.length === 0) return false
  const normalized = normalizeEmail(email)
  const at = normalized.lastIndexOf('@')
  if (at < 1) return false
  const domain = normalized.slice(at + 1)
  return domains.includes(domain)
}

export function autoApproveDomains(): string[] {
  return parseAutoApproveDomains(process.env.ADMIN_AUTO_APPROVE_DOMAINS)
}

/**
 * Clamp a post-sign-in redirect to a path inside this app's admin area.
 *
 * The `next` value arrives from a query string, on the kind of sign-in URL that
 * gets pasted into a chat, so it is treated as hostile. A scheme-relative
 * "//evil.com" is a valid *path* to the URL parser and would send a
 * freshly-authenticated admin off-site with their session live; a backslash
 * variant is normalised to the same thing by some browsers. Anything that is
 * not plainly an /admin path falls back to the dashboard.
 */
export function safeAdminRedirectPath(next: string | null | undefined): string {
  const fallback = '/admin/jobs'
  if (!next) return fallback
  if (!next.startsWith('/')) return fallback
  if (next.startsWith('//') || next.startsWith('/\\')) return fallback
  if (next !== '/admin' && !next.startsWith('/admin/')) return fallback
  return next
}

export const RECOVERY_ADMIN_SETTING = 'recovery_admin_email'

/** Used when the settings row is missing, so recovery never depends on a read. */
export const RECOVERY_ADMIN_FALLBACK = 'mmss@monashclubs.org'

/**
 * The address that can always get back in.
 *
 * Falls back to a constant rather than returning null if the lookup fails. The
 * moment this matters is the moment something is already wrong, so a recovery
 * route that itself depends on a working database read is not much of a
 * recovery route.
 */
export async function recoveryAdminEmail(adminClient: SupabaseClient): Promise<string> {
  const { data } = await adminClient
    .from('admin_settings')
    .select('value')
    .eq('key', RECOVERY_ADMIN_SETTING)
    .maybeSingle()

  const value = (data as { value: string | null } | null)?.value
  return value ? normalizeEmail(value) : RECOVERY_ADMIN_FALLBACK
}

export type AdminAccessResult =
  | { granted: true; reason: 'existing' | 'invite' | 'domain' | 'recovery' }
  | { granted: false; reason: 'no-email' | 'unverified-email' | 'not-invited' }

/**
 * Reconcile a signed-in auth user against the email-keyed grants, creating the
 * admin_users row when one is owed.
 *
 * Must be called with a service-role client: the user is not an admin at the
 * moment it runs, so RLS would refuse both the read of admin_invites and the
 * insert into admin_users.
 */
export async function ensureAdminAccess(
  adminClient: SupabaseClient,
  user: Pick<User, 'id' | 'email' | 'email_confirmed_at'>
): Promise<AdminAccessResult> {
  if (!user.email) return { granted: false, reason: 'no-email' }
  const email = normalizeEmail(user.email)

  // An existing grant wins outright and short-circuits the rest, so revoking
  // someone by deleting their admin_users row is not silently undone on their
  // next sign-in by a stale invite row.
  const { data: existing } = await adminClient
    .from('admin_users')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle()

  if ((existing as { is_admin: boolean } | null)?.is_admin) {
    return { granted: true, reason: 'existing' }
  }

  // Checked before invites and domains. This grant is the one that must hold
  // when everything else has lapsed, so it does not depend on a row anybody
  // could have deleted.
  const isRecoveryAdmin = email === (await recoveryAdminEmail(adminClient))

  const { data: invite } = await adminClient
    .from('admin_invites')
    .select('id')
    .eq('email', email)
    .maybeSingle()

  const invited = Boolean(invite)
  const domainApproved = emailMatchesAutoApprovedDomain(email, autoApproveDomains())

  if (!invited && !domainApproved && !isRecoveryAdmin) {
    return { granted: false, reason: 'not-invited' }
  }

  // Domain auto-approval trusts the address, so the address has to have been
  // proven. Google sign-in always confirms it; this matters for any account
  // created another way, where an unconfirmed address on an approved domain
  // would otherwise be a free admin account for whoever typed it.
  if (!invited && !isRecoveryAdmin && !user.email_confirmed_at) {
    return { granted: false, reason: 'unverified-email' }
  }

  const { error: grantError } = await adminClient
    .from('admin_users')
    .upsert({ id: user.id, is_admin: true }, { onConflict: 'id' })

  if (grantError) return { granted: false, reason: 'not-invited' }

  // Record the claim for the audit trail. The invitation row is kept rather
  // than deleted: it is the standing grant, and deleting it here would revoke
  // the person the moment they used it.
  if (invite) {
    await adminClient
      .from('admin_invites')
      .update({ claimed_at: new Date().toISOString(), claimed_by: user.id })
      .eq('id', (invite as { id: string }).id)
      .is('claimed_at', null)
  }

  return { granted: true, reason: isRecoveryAdmin ? 'recovery' : invited ? 'invite' : 'domain' }
}
