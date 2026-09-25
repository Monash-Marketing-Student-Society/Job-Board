/**
 * Shared plumbing for the /api/admin/staged/* routes: the admin gate and the
 * ActionResult -> HTTP mapping, so all three routes answer identically.
 */

import { NextResponse } from 'next/server'
import { getUser, isCurrentUserAdmin } from '../supabase/server'
import type { ActionResult } from './staged-actions'

/** The reviewer's user id, or null if the caller is not an admin. */
export async function requireAdminId(): Promise<string | null> {
  if (!(await isCurrentUserAdmin())) return null
  const user = await getUser()
  return user?.id ?? null
}

export function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

export function toResponse(result: ActionResult) {
  if (result.ok) return NextResponse.json({ success: true, job_id: result.jobId })
  if (result.kind === 'conflict') {
    // 409, not 404: for a racing admin the row exists, it just isn't pending.
    return NextResponse.json({ error: 'Not found or already actioned' }, { status: 409 })
  }
  console.error('Staged job action failed:', result.message)
  const error = result.stranded
    ? 'Could not publish the job, and could not return it to the queue. It is marked approved with nothing on the board -- set it back to pending before retrying.'
    : 'Action failed'
  return NextResponse.json({ error }, { status: 500 })
}
