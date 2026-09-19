import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { RANGE_GRANULARITY, REPORTING_TIMEZONE } from './constants'
import {
  bucketWindow,
  fillActionSeries,
  fillBuckets,
  normalizeActionCounts,
  shiftBucket,
  topInterests,
  withVocabulary,
} from './buckets'
import { JOB_FUNCTIONS } from '@/lib/tags'
import { growthInsight } from './growth'
import { audienceTiles, engagementTiles, funnelSteps } from './metrics'
import type { GrowthInsight } from './growth'
import type { FunnelStep, MetricTile } from './metrics'
import type { ActionBucketRow, FilledBucket, InterestSlice } from './buckets'
import type { Period } from './period'
import type {
  ActionCountRow,
  ActionCounts,
  DwellBucket,
  InterestRow,
  ViewerBucket,
} from '@/lib/types'

/** Cache tag for the analytics dashboard. */
export const ANALYTICS_TAG = 'analytics'

/** How many labels each interest chart shows before folding the tail into "Other". */
const INTEREST_LIMIT = 8

/**
 * How many tags the bars show.
 *
 * Five, because past that the list stops being a ranking and becomes an
 * inventory — and the inventory is what the table underneath is for, where
 * every tag in the vocabulary appears whether it drew interest or not.
 */
const TAG_CHART_LIMIT = 5

/**
 * How many labels per dimension the database returns.
 *
 * Comfortably above INTEREST_LIMIT so the "Other" row is the real remainder
 * rather than the remainder of a truncated list, but still bounded — a job
 * board with thousands of distinct tags should not ship them all to the page.
 */
const INTEREST_FETCH_LIMIT = 50

export interface AnalyticsSnapshot {
  /**
   * The series the chart draws, oldest first, gaps zero-filled.
   *
   * Daily on the short ranges, weekly across three months — see `chart` on the
   * range options. The cadence is stated alongside it rather than inferred,
   * because a reader cannot tell thirteen weeks from thirteen days by looking.
   */
  chartBuckets: FilledBucket[]
  chartCadence: string
  /** Headline tiles for the Audience section — reach and depth. */
  audience: MetricTile[]
  /** Headline tiles for the Engagement section — what visitors did. */
  engagement: MetricTile[]
  /** View → click → apply → confirmed, each step a subset of the one above. */
  funnel: FunnelStep[]
  jobTypes: InterestSlice[]
  /** Top tags, for the bars. */
  tags: InterestSlice[]
  /** Every tag in the vocabulary, zero-filled, for the table under them. */
  tagsAll: InterestSlice[]
  actions: ActionCounts
  /** Period-over-period movers, compared against the equal-length prior window. */
  jobTypeGrowth: GrowthInsight
  tagGrowth: GrowthInsight
  /** True when nothing was tracked in the window — the page says so rather than drawing empty axes. */
  isEmpty: boolean
}

/**
 * Everything the analytics dashboard renders, for one granularity.
 *
 * Cached across requests for the same reasons `getPendingSubmissionCount` is
 * (see lib/admin-data.ts): the numbers are identical for every admin, the page
 * is re-rendered on every navigation, and these are aggregate queries over a
 * table that only grows. It uses the service-role client deliberately — a
 * shared cache must not hold a value that depended on whose session filled it.
 *
 * There is no tag invalidation here, unlike the submissions count: events
 * arrive continuously from anonymous visitors, so there is no mutation to hang
 * a `revalidateTag` off. The 5-minute TTL is the whole correctness story, which
 * is fine for engagement reporting — nobody needs the click count to the second.
 *
 * Note `analytics_events` also carries an admin-only RLS SELECT policy, so the
 * anon key cannot read it even though this path bypasses RLS.
 */
export async function getAnalyticsSnapshot(period: Period): Promise<AnalyticsSnapshot> {
  const { days, offsetDays, chart } = period

  const load = unstable_cache(
    async (): Promise<AnalyticsSnapshot> => {
      const supabase = createAdminClient()
      const args = {
        p_granularity: RANGE_GRANULARITY,
        p_buckets: days,
        p_tz: REPORTING_TIMEZONE,
        // Where the window ends. Zero for the presets, which all end today;
        // whatever the second date says for a custom range (0023).
        p_offset_buckets: offsetDays,
      }
      // Twice the reported range, in one call, for anything a tile compares
      // against the previous period: the series arrives with its own
      // comparison window attached and is cut in half here rather than fetched
      // twice. See splitWindows in trend.ts.
      const doubledArgs = { ...args, p_buckets: days * 2 }

      // One round trip each, issued together — they share a window but not a
      // shape, and unioning them in SQL would mean reconciling three different
      // row types for no saving.
      const [
        interest,
        priorInterest,
        actions,
        daily,
        actionSeries,
        dwellSeries,
        chartSeries,
        earliest,
      ] = await Promise.all([
        supabase.rpc('analytics_interest_breakdown', { ...args, p_limit: INTEREST_FETCH_LIMIT }),
        // The equal-length window immediately before this one. Offsetting by
        // the bucket count is what makes the growth figures period-over-period
        // rather than a comparison against an arbitrary earlier stretch.
        supabase.rpc('analytics_interest_breakdown', {
          ...args,
          p_limit: INTEREST_FETCH_LIMIT,
          p_offset_buckets: offsetDays + days,
        }),
        supabase.rpc('analytics_action_counts', args),
        // Daily series behind the visitors chart and the audience tiles, over
        // the reported window *and* the one before it. It used to fetch a fixed
        // 90 days regardless, because the card sliced its own shorter ranges
        // client-side; with one control for the page there is nothing left to
        // slice but the period-over-period cut.
        supabase.rpc('analytics_viewers_by_bucket', doubledArgs),
        // The same shape for every other event type, which is what puts a
        // sparkline and a movement figure on the engagement tiles.
        supabase.rpc('analytics_actions_by_bucket', doubledArgs),
        // Average time on page, per day, over the reported window and the one
        // before it. Same graceful-degradation deal as the series above: it
        // arrives with 0022, and a database without that migration still
        // renders the page — see the dwell fallback in `audienceTiles`.
        supabase.rpc('analytics_dwell_by_bucket', doubledArgs),
        // The chart's own series, when it is drawn at a coarser cadence than
        // the daily one everything else is cut from. Weekly distinct viewers
        // have to be counted by the database, not summed from daily rows.
        chart.granularity === RANGE_GRANULARITY
          ? Promise.resolve(null)
          : supabase.rpc('analytics_viewers_by_bucket', {
              p_granularity: chart.granularity,
              p_buckets: chart.buckets,
              p_tz: REPORTING_TIMEZONE,
              p_offset_buckets: chart.offset,
            }),
        // Oldest event on record. Used to decide whether the previous window is
        // actually covered by tracked history — see below.
        supabase
          .from('analytics_events')
          .select('occurred_at')
          .order('occurred_at', { ascending: true })
          .limit(1)
          .maybeSingle(),
      ])

      for (const { error } of [
        interest,
        priorInterest,
        actions,
        daily,
        ...(chartSeries ? [chartSeries] : []),
        earliest,
      ]) {
        if (error) {
          console.error('Analytics query failed:', error)
          throw new Error('Failed to load analytics')
        }
      }

      // Deliberately outside the loop above: `analytics_actions_by_bucket`
      // (0021) is newer than the rest of the dashboard, so a database that has
      // not run that migration yet must still render the page. Losing it costs
      // the engagement tiles their sparkline and their percentage; it does not
      // cost anyone the figures.
      if (actionSeries.error) {
        console.warn(
          'Analytics: per-action daily series unavailable, falling back to totals.',
          actionSeries.error
        )
      }

      if (dwellSeries.error) {
        console.warn(
          'Analytics: time-on-page unavailable, falling back to views per viewer.',
          dwellSeries.error
        )
      }

      const interestRows = (interest.data ?? []) as InterestRow[]
      const priorInterestRows = (priorInterest.data ?? []) as InterestRow[]
      const actionRows = (actions.data ?? []) as ActionCountRow[]
      const dailyRows = (daily.data ?? []) as ViewerBucket[]
      const actionSeriesRows = actionSeries.error
        ? null
        : ((actionSeries.data ?? []) as ActionBucketRow[])

      // Does tracked history actually reach back far enough to compare against?
      // On the widest range the previous window starts six months back, which
      // can be before the first event ever recorded; the database returns a
      // near-empty window and the division produces figures like "+5462%
      // growth", which is not growth but the absence of history. Requiring full
      // coverage keeps the dashboard from inventing a trend out of a gap.
      const now = new Date()
      // The reported window's own start, slid back by the offset, then back
      // again by its own length: that is the stretch the growth figures are
      // compared against.
      const windowStart = shiftBucket(
        RANGE_GRANULARITY,
        bucketWindow(RANGE_GRANULARITY, days, now, REPORTING_TIMEZONE).start,
        -offsetDays,
        REPORTING_TIMEZONE
      )
      const previousWindowStart = shiftBucket(
        RANGE_GRANULARITY,
        windowStart,
        -days,
        REPORTING_TIMEZONE
      )
      const earliestEvent = (earliest.data as { occurred_at: string } | null)?.occurred_at
      const historyCoversPreviousWindow =
        earliestEvent !== undefined && new Date(earliestEvent) <= previousWindowStart

      const jobTypes = topInterests(interestRows, 'job_type', INTEREST_LIMIT)
      // The full vocabulary first, then the visible slice off the top of it —
      // one sorted list, so the bars can never disagree with the table.
      const tagsAll = withVocabulary(
        topInterests(interestRows, 'tag', INTEREST_FETCH_LIMIT),
        JOB_FUNCTIONS
      )
      const tags = tagsAll.slice(0, TAG_CHART_LIMIT)

      // Bucket labels are derived here, inside the cache, from the same instant
      // the SQL used. Deriving them at read time instead would silently break
      // the moment a cached payload outlived a bucket boundary: the axis would
      // advance, the rows would not, and every bar would render as zero.
      const dailyWithHistory = fillBuckets(
        dailyRows,
        RANGE_GRANULARITY,
        days * 2,
        now,
        REPORTING_TIMEZONE,
        offsetDays
      )
      const actionCounts = normalizeActionCounts(actionRows)

      return {
        // The chart shows the reported window only; the earlier half of the
        // daily series exists for the comparison and is not something the page
        // draws.
        chartBuckets: chartSeries
          ? fillBuckets(
              (chartSeries.data ?? []) as ViewerBucket[],
              chart.granularity,
              chart.buckets,
              now,
              REPORTING_TIMEZONE,
              chart.offset
            )
          : dailyWithHistory.slice(days),
        chartCadence: chart.cadence,
        audience: audienceTiles({
          daily: dailyWithHistory,
          distinctViewers: actionCounts.view.visitors,
          dwell: dwellSeries.error ? null : ((dwellSeries.data ?? []) as DwellBucket[]),
          comparable: historyCoversPreviousWindow,
        }),
        engagement: engagementTiles(
          actionSeriesRows &&
            fillActionSeries(
              actionSeriesRows,
              RANGE_GRANULARITY,
              days * 2,
              now,
              REPORTING_TIMEZONE,
              offsetDays
            ),
          actionCounts,
          historyCoversPreviousWindow
        ),
        funnel: funnelSteps(actionCounts),
        jobTypes,
        tags,
        tagsAll,
        actions: actionCounts,
        // Growth is compared against the *unfolded* prior rows, not the top-N
        // slice: a category can drop out of the visible top N between windows,
        // and comparing against a truncated list would read that as a collapse.
        jobTypeGrowth: growthInsight(
          jobTypes,
          topInterests(priorInterestRows, 'job_type', INTEREST_FETCH_LIMIT),
          { subjectNoun: 'roles', historyCoversPreviousWindow }
        ),
        tagGrowth: growthInsight(
          tags,
          topInterests(priorInterestRows, 'tag', INTEREST_FETCH_LIMIT),
          { historyCoversPreviousWindow }
        ),
        isEmpty: actionRows.length === 0,
      }
    },
    ['analytics', period.key],
    { tags: [ANALYTICS_TAG], revalidate: 300 }
  )

  return load()
}
