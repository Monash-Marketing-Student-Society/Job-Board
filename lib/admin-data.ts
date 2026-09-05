import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'

/** Cache tags — revalidate these when the underlying rows change. */
export const SUBMISSIONS_TAG = 'submissions'

/**
 * Count of submissions awaiting review, shown as a badge in the admin nav on
 * every admin page.
 *
 * This is the one admin query worth caching across requests: it is identical
 * for every admin, it is re-run on every navigation, and it is a COUNT over a
 * growing table. It uses the service-role client deliberately — the cached
 * value must not depend on whose session ran it, since the cache is shared.
 *
 * Correctness comes from tag invalidation rather than a short TTL: anything
 * that changes the pending set calls `revalidateTag(SUBMISSIONS_TAG)`, so the
 * badge updates immediately. The TTL is only a backstop.
 */
export const getPendingSubmissionCount = unstable_cache(
  async () => {
    const { count } = await createAdminClient()
      .from('job_submissions')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
      .is('archived_at', null)

    return count ?? 0
  },
  ['pending-submission-count'],
  { tags: [SUBMISSIONS_TAG], revalidate: 300 }
)

/**
 * Per-status totals for the submissions queue's filter tabs — true counts
 * over the whole table, not just the current page. The page's own paginated
 * query (`app/admin/submissions/page.tsx`) already returns an exact total
 * for the unfiltered set via `count: 'exact'`, so that one is reused for
 * "all" rather than duplicated here; this only covers the three statuses.
 *
 * `head: true` on each — three lightweight COUNT-only queries in parallel,
 * same shape as `getPendingSubmissionCount` above, not one row fetched.
 * Same service-role-client-plus-tag-invalidation reasoning as that one: the
 * cache is shared across admins, so it can't depend on whose session ran it,
 * and every submission mutation route already calls
 * `revalidateTag(SUBMISSIONS_TAG)`.
 */
export const getSubmissionStatusCounts = unstable_cache(
  async (archived: boolean) => {
    const client = createAdminClient()

    const countFor = (status: 'pending' | 'approved' | 'rejected') => {
      const query = client
        .from('job_submissions')
        .select('*', { count: 'exact', head: true })
        .eq('status', status)

      return archived ? query.not('archived_at', 'is', null) : query.is('archived_at', null)
    }

    const [pending, approved, rejected] = await Promise.all([
      countFor('pending'),
      countFor('approved'),
      countFor('rejected'),
    ])

    return {
      pending: pending.count ?? 0,
      approved: approved.count ?? 0,
      rejected: rejected.count ?? 0,
    }
  },
  ['submission-status-counts'],
  { tags: [SUBMISSIONS_TAG], revalidate: 300 }
)

/**
 * Active/inactive totals for the Manage Jobs page's filter tabs — true
 * counts over the whole table, not just the current (paginated) page, same
 * role as getSubmissionStatusCounts above.
 *
 * Deliberately NOT unstable_cache'd, unlike every other query in this file:
 * job mutations (deactivate/activate/delete) go straight from the browser
 * client to Supabase — job-table.tsx calls supabase.from('jobs').update(...)
 * directly, there is no API route in the loop — so there is no server-side
 * mutation point left to call revalidateTag from. A cached count here would
 * only ever refresh on its TTL, not on the job-table.tsx `router.refresh()`
 * that already runs after every mutation and is what these counts actually
 * need to respond to. A plain query re-runs fresh on every request instead.
 */
export async function getJobStatusCounts() {
  const client = createAdminClient()

  const countFor = (isActive: boolean) =>
    client.from('jobs').select('*', { count: 'exact', head: true }).eq('is_active', isActive)

  const [active, inactive] = await Promise.all([countFor(true), countFor(false)])

  return {
    active: active.count ?? 0,
    inactive: inactive.count ?? 0,
  }
}
