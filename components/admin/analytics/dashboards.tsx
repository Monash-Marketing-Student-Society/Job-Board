import { MousePointerClick, Users } from 'lucide-react'

import { DashboardSection } from './dashboard-section'
import { MetricCards } from './metric-cards'
import { ChartViewersOverTime } from './chart-viewers-over-time'
import { ConversionFunnel } from './funnel'
import { RankedBars } from './ranked-bars'
import type { Period } from '@/lib/analytics/period'
import type { AnalyticsSnapshot } from '@/lib/analytics/queries'

/**
 * The two dashboards, given a snapshot.
 *
 * Split out of the page so the admin route and the local preview route render
 * exactly the same thing from exactly the same data — a preview that drifts
 * from the page it previews is worse than no preview.
 */
export function AnalyticsDashboards({
  snapshot,
  period,
  basePath,
}: {
  snapshot: AnalyticsSnapshot
  period: Period
  /** Where the period control's links point. */
  basePath: string
}) {
  const {
    chartBuckets,
    chartCadence,
    audience,
    engagement,
    funnel,
    jobTypes,
    tags,
    tagsAll,
    jobTypeGrowth,
    tagGrowth,
  } = snapshot

  return (
    <div className="space-y-5">
      <DashboardSection title="Audience" icon={Users} period={period} basePath={basePath}>
        <MetricCards tiles={audience} periodLabel={period.spanLabel} />
        <ChartViewersOverTime data={chartBuckets} cadence={chartCadence} />
      </DashboardSection>

      <DashboardSection
        title="Engagement"
        description="What they did with the jobs they found"
        icon={MousePointerClick}
        period={period}
        basePath={basePath}
      >
        <MetricCards tiles={engagement} periodLabel={period.spanLabel} />
        <ConversionFunnel steps={funnel} />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <RankedBars
            title="Interest by job type"
            growth={jobTypeGrowth}
            data={jobTypes}
            dimensionLabel="Job type"
            barColor="var(--graph-mark, #8367a3)"
            emptyMessage="No job types recorded yet"
          />
          <RankedBars
            title="Interest by tag"
            growth={tagGrowth}
            data={tags}
            tableData={tagsAll}
            dimensionLabel="Tag"
            barColor="var(--graph-mark, #8367a3)"
            emptyMessage="No tags recorded yet"
          />
        </div>
      </DashboardSection>
    </div>
  )
}

export function AnalyticsEmptyState() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
      <h2 className="font-heading text-base font-semibold text-slate-800">
        No activity recorded yet
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
        Views, clicks, apply clicks and shares are tracked from the moment a visitor opens
        the job board. Numbers will appear here once the first visitor arrives — or try a
        wider time range above.
      </p>
    </div>
  )
}
