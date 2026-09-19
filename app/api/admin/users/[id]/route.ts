import { NextResponse } from 'next/server'
import { isCurrentUserAdmin, getUser } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  normalizeEmail,
  autoApproveDomains,
  emailMatchesAutoApprovedDomain,
} from '@/lib/admin-access'

/**
 * DELETE /api/admin/users/[id]
 *
 * Revoke admin access. The underlying auth account is left intact — this is a
 * change of role, not a deletion of a person, and destroying the auth user
 * would cascade into anything keyed on it.
 *
 * Revocation has to remove *both* representations of the grant. Deleting only
 * the admin_users row would leave the email-keyed invitation standing, and the
 * next sign-in would hand the access straight back (lib/admin-access.ts) — a
 * revocation that silently undoes itself is worse than none, because the admin
 * who clicked it has been told it worked.
 *
 * The one grant this cannot revoke is domain auto-approval: while the address
 * sits on a domain in ADMIN_AUTO_APPROVE_DOMAINS it is re-granted on the next
 * sign-in by design. The response says so rather than letting the UI imply a
 * removal that will not hold.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  if (!(await isCurrentUserAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const currentUser = await getUser()
  if (currentUser?.id === id) {
    return NextResponse.json({ error: 'You cannot remove your own admin access' }, { status: 400 })
  }

  const adminClient = createAdminClient()

  const { data: target } = await adminClient.auth.admin.getUserById(id)
  const email = target.user?.email ? normalizeEmail(target.user.email) : null

  const { error } = await adminClient.from('admin_users').delete().eq('id', id)
  if (error) {
    return NextResponse.json({ error: 'Failed to remove admin' }, { status: 500 })
  }

  if (email) {
    await adminClient.from('admin_invites').delete().eq('email', email)
  }

  const domains = autoApproveDomains()
  const willReturn = Boolean(email && emailMatchesAutoApprovedDomain(email, domains))

  return NextResponse.json({
    success: true,
    email,
    // True when the address is still covered by a domain rule, so the UI can
    // say plainly that this person regains access on their next sign-in.
    reGrantedByDomain: willReturn,
  })
}
