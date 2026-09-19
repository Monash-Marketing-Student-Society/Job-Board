import { NextResponse } from 'next/server'
import { isCurrentUserAdmin } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * DELETE /api/admin/invites/[id]
 *
 * Withdraw an invitation that has not been signed in against yet. Distinct from
 * revoking an admin: there is no auth account and no admin_users row to remove,
 * only the standing grant on the address.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  if (!(await isCurrentUserAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const adminClient = createAdminClient()
  const { error } = await adminClient.from('admin_invites').delete().eq('id', id)

  if (error) {
    return NextResponse.json({ error: 'Failed to withdraw the invitation' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
