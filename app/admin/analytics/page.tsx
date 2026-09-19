import { getAnalyticsSnapshot } from '@/lib/analytics/queries'
import { resolvePeriod } from '@/lib/analytics/period'
import {
  AnalyticsDashboards,
  AnalyticsEmptyState,
} from '@/components/admin/analytics/dashboards'

export const metadata = {
  title: 'User Analytics | Admin | MMSS Job Board',
}

interface PageProps {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>
}

/**
 * Two dashboards, one period.
 *
 * The page answers two questions that were previously stacked into one
 * undifferentiated column of cards: how many people the board reached
 * (Audience) and what those people then did (Engagement). Giving each its own
 * titled surface is what lets a reader stop at the first one — most weeks the
 * committee only wants reach — and it puts the funnel and the interest lists
 * next to the tiles they explain rather than three scroll-lengths below them.
 *
 * The period lives in the address, as a preset (`?range=30d`) or a pair of
 * dates (`?from=…&to=…`), and `resolvePeriod` is total: anything unparseable
 * becomes the default rather than reaching a Postgres function unchecked. Each
 * section's header carries a control that writes to it.
 */
export default async function AdminAnalyticsPage({ searchParams }: PageProps) {
  const period = resolvePeriod(await searchParams)
  const snapshot = await getAnalyticsSnapshot(period)

  return (
    <div>
      {/* No subtitle. The period is stated by the control in each section
          header, and the reporting timezone never changes — a line repeating
          both under every load was furniture. */}
      <h1 className="mb-5 font-heading text-[22px] font-bold text-slate-800">User Analytics</h1>

      {snapshot.isEmpty ? (
        <AnalyticsEmptyState />
      ) : (
        <AnalyticsDashboards
          snapshot={snapshot}
          period={period}
          basePath="/admin/analytics"
        />
      )}
    </div>
  )
}
