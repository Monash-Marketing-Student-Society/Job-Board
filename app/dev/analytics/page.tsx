import { notFound } from 'next/navigation'

import { getAnalyticsSnapshot } from '@/lib/analytics/queries'
import { resolvePeriod } from '@/lib/analytics/period'
import {
  AnalyticsDashboards,
  AnalyticsEmptyState,
} from '@/components/admin/analytics/dashboards'

export const metadata = {
  title: 'Analytics preview (dev) | MMSS Job Board',
}

/**
 * The analytics dashboards, without the admin sign-in.
 *
 * Judging this page's layout means looking at it, and looking at it otherwise
 * costs a Supabase session and an `admin_users` row on whatever database the
 * dev server is pointed at. This route renders the same components from the
 * same snapshot with no auth in front of it, so the design can be reviewed in
 * a browser in one step.
 *
 * It exists only in development. `notFound()` fires before anything is read
 * when NODE_ENV is production, so a deployed build has no such route — the
 * dashboard's own data is admin-only and this must never become the way around
 * that. Note the snapshot query runs under the service-role client either way
 * (see lib/analytics/queries.ts), which is precisely why the guard is the first
 * statement in the function rather than a check somewhere below the fetch.
 *
 * Seed a local database first, or there is nothing to look at:
 *   node scripts/seed-analytics.mjs
 */
export default async function DevAnalyticsPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>
}) {
  if (process.env.NODE_ENV === 'production') notFound()

  const period = resolvePeriod(await searchParams)
  const snapshot = await getAnalyticsSnapshot(period)

  return (
    <div className="min-h-screen bg-[#e8e8e8]">
      <main className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-[15px]">
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Development preview of <code>/admin/analytics</code> — no sign-in, dev builds
          only.
        </div>

        <h1 className="mb-5 font-heading text-[22px] font-bold text-slate-800">
          User Analytics
        </h1>

        {snapshot.isEmpty ? (
          <AnalyticsEmptyState />
        ) : (
          <AnalyticsDashboards snapshot={snapshot} period={period} basePath="/dev/analytics" />
        )}
      </main>
    </div>
  )
}
