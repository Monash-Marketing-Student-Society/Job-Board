import { ACTION_LABELS } from './constants'
import { mean, ratioSeries, splitWindows, sum, trendBetween, NO_TREND } from './trend'
import type { Trend } from './trend'
import type { FilledBucket } from './buckets'
import type { ActionCounts, AnalyticsEventType, DwellBucket } from '@/lib/types'

/**
 * The headline tiles, as data.
 *
 * Built on the server, next to the queries that feed them, so the components
 * that draw them stay presentational: a tile is a label, a figure, a movement
 * and — where the measure has an honest daily shape — the shape itself. Which
 * measures get a percentage and which do not is decided here rather than in the
 * markup, because it is a question about the data, not about layout.
 */

export type MetricFormat = 'count' | 'decimal' | 'percent' | 'duration'

export interface MetricTile {
  key: string
  label: string
  value: number
  format: MetricFormat
  /**
   * Daily values over the reported window, for the sparkline.
   *
   * Empty for measures with no honest daily shape — a distinct count is not
   * additive across days, so a line of per-day distinct counts is a different
   * measure from the total sitting above it, and drawing one under the other
   * would invite reading the line as the figure's history.
   */
  series: number[]
  trend: Trend
  /** One line saying something the label cannot. Only where that exists. */
  note?: string
}

export interface AudienceInput {
  /** Double-length daily series: the reported window preceded by its comparison window. */
  daily: FilledBucket[]
  /** True distinct visitors over the reported window, from the action counts. */
  distinctViewers: number
  /**
   * Double-length daily time-on-page series, or null on a database that has
   * not run 0022 yet — in which case the fourth tile falls back to the depth
   * measure it replaced rather than leaving a hole in the row.
   */
  dwell: DwellBucket[] | null
  /** Whether tracked history reaches back far enough to cover the comparison window. */
  comparable: boolean
}

/**
 * Who showed up, and how deep they went.
 *
 * The first tile carries no percentage on purpose. Distinct viewers over a
 * window is not the sum of distinct viewers per day — one person visiting on
 * four days is four daily viewers and one window viewer — so neither the daily
 * series nor a doubled-window subtraction can produce its previous value, and
 * inventing one would be the most quietly wrong number on the page. The tile
 * beside it reports the daily average instead, which *is* comparable, and
 * between them they answer both questions honestly.
 */
export function audienceTiles({
  daily,
  distinctViewers,
  dwell,
  comparable,
}: AudienceInput): MetricTile[] {
  const [before, now] = splitWindows(daily)

  const views = now.map((bucket) => bucket.views)
  const viewsBefore = before.map((bucket) => bucket.views)
  const viewers = now.map((bucket) => bucket.viewers)
  const viewersBefore = before.map((bucket) => bucket.viewers)

  return [
    {
      key: 'visitors',
      label: 'Unique visitors',
      value: distinctViewers,
      format: 'count',
      series: [],
      trend: NO_TREND,
    },
    {
      key: 'pageviews',
      label: 'Page Views',
      value: sum(views),
      format: 'count',
      series: views,
      trend: trendBetween(sum(views), sum(viewsBefore), { comparable }),
    },
    {
      key: 'visitors-per-day',
      label: 'Visitors per day',
      value: round1(mean(viewers)),
      format: 'decimal',
      series: viewers,
      trend: trendBetween(mean(viewers), mean(viewersBefore), { comparable }),
    },
    dwell ? timeOnPageTile(dwell, comparable) : depthTile(views, viewsBefore, viewers, viewersBefore, comparable),
  ]
}

/**
 * Average foreground seconds per listing opened.
 *
 * Weighted by sample count rather than averaged across days: a Sunday with two
 * readers and a Wednesday with two hundred are not two equal data points, and
 * taking the mean of the two daily averages would let the quiet day carry half
 * the figure.
 */
function timeOnPageTile(dwell: DwellBucket[], comparable: boolean): MetricTile {
  const [before, now] = splitWindows(dwell)

  return {
    key: 'time-on-page',
    label: 'Avg. time on page',
    value: Math.round(weightedMeanMs(now) / 1000),
    format: 'duration',
    // The daily averages are the shape; a day nobody read anything contributes
    // a zero, which is the truth about that day.
    series: now.map((bucket) => Number(bucket.avg_ms) / 1000),
    trend: trendBetween(weightedMeanMs(now), weightedMeanMs(before), {
      // Milliseconds, so the count-shaped floor would pass anything; what has
      // to be true instead is that the earlier window had readers at all.
      comparable: comparable && sum(before.map((bucket) => Number(bucket.samples))) > 0,
      minBase: 0,
    }),
    note: 'Foreground time per listing opened',
  }
}

function weightedMeanMs(buckets: DwellBucket[]): number {
  const samples = sum(buckets.map((bucket) => Number(bucket.samples) || 0))
  if (samples === 0) return 0

  const total = sum(
    buckets.map((bucket) => (Number(bucket.avg_ms) || 0) * (Number(bucket.samples) || 0))
  )

  return total / samples
}

/**
 * What the fourth tile showed before there was any timing data, and what it
 * shows again on a database without 0022: how many listings a visitor opens.
 * A count standing in for an interest signal — which is exactly why time on
 * page replaced it — but a real measure, and better than an empty cell.
 */
function depthTile(
  views: number[],
  viewsBefore: number[],
  viewers: number[],
  viewersBefore: number[],
  comparable: boolean
): MetricTile {
  return {
    key: 'views-per-viewer',
    label: 'Views per visitor',
    value: round1(safeRatio(sum(views), sum(viewers))),
    format: 'decimal',
    series: ratioSeries(views, viewers),
    trend: trendBetween(
      safeRatio(sum(views), sum(viewers)),
      safeRatio(sum(viewsBefore), sum(viewersBefore)),
      { comparable: comparable && sum(viewersBefore) > 0, minBase: 0 }
    ),
    note: 'Listings opened per visitor, per day',
  }
}

/** Double-length daily event counts, keyed by action. */
export type ActionSeries = Record<AnalyticsEventType, number[]>

/**
 * What they did with what they found.
 *
 * Each figure comes from the window totals, and only its shape and its
 * movement come from the series. That split is deliberate: the two are
 * different queries, and when they disagreed — a truncated series against an
 * intact total, see 0024 — the page showed one number in a tile and a
 * different one for the same measure in the funnel below it. Reading the
 * headline from the same place the funnel reads it means they cannot part
 * company again, whatever happens to the series.
 */
export function engagementTiles(
  series: ActionSeries | null,
  actions: ActionCounts,
  comparable: boolean
): MetricTile[] {
  const counts: { key: AnalyticsEventType }[] = [
    { key: 'click' },
    { key: 'apply' },
    { key: 'share' },
  ]

  const tiles = counts.map(({ key }): MetricTile => {
    // No per-action daily series: the aggregation that produces it is newer
    // than the dashboard, so a database that has not run 0021 yet still
    // renders — with figures and without shapes, rather than not at all.
    if (!series) {
      return {
        key,
        label: ACTION_LABELS[key],
        value: actions[key].events,
        format: 'count',
        series: [],
        trend: NO_TREND,
      }
    }

    const [before, now] = splitWindows(series[key])

    return {
      key,
      label: ACTION_LABELS[key],
      value: actions[key].events,
      format: 'count',
      series: now,
      trend: trendBetween(sum(now), sum(before), { comparable }),
    }
  })

  // Third of four, so the row reads click → apply → the rate between them →
  // share.
  tiles.splice(2, 0, applyRateTile(series, actions, comparable))

  return tiles
}

/**
 * Apply clicks as a share of listing opens.
 *
 * This slot used to hold confirmed applications, which is the one figure on
 * the page nobody should plan around: it counts only visitors who applied on
 * the employer's site, came back to the board afterwards, and answered a
 * prompt — three things in a row that mostly do not happen. As a headline it
 * reads as "we produced 42 applications", when what it means is "at least 42,
 * and we have no idea by how much we are under". (It survives in the funnel,
 * where the step above it supplies the context that makes it readable.)
 *
 * What replaces it is measured entirely from events the board itself observes:
 * of the listings people opened, what share sent them to the employer. That is
 * the closest honest proxy for the board working, and unlike the figure it
 * replaces it moves for reasons the committee can act on — a listing with a
 * broken apply link, or a week of jobs nobody wanted to apply for.
 */
function applyRateTile(
  series: ActionSeries | null,
  actions: ActionCounts,
  comparable: boolean
): MetricTile {
  // The rate itself is always the window totals divided, for the same reason
  // the counts above are: it has to agree with the funnel, which divides the
  // same two numbers.
  const rate = round1(safeRatio(actions.apply.events, actions.click.events) * 100)

  if (!series) {
    return {
      key: 'apply-rate',
      label: 'Apply rate',
      value: rate,
      format: 'percent',
      series: [],
      trend: NO_TREND,
    }
  }

  const [clicksBefore, clicksNow] = splitWindows(series.click)
  const [appliesBefore, appliesNow] = splitWindows(series.apply)

  const rateNow = safeRatio(sum(appliesNow), sum(clicksNow)) * 100
  const rateBefore = safeRatio(sum(appliesBefore), sum(clicksBefore)) * 100

  return {
    key: 'apply-rate',
    label: 'Apply rate',
    value: rate,
    format: 'percent',
    // Per-day rate, not per-day apply count: the shape has to be the same
    // measure as the figure above it, or the line contradicts the number.
    series: ratioSeries(appliesNow, clicksNow).map((value) => value * 100),
    trend: trendBetween(rateNow, rateBefore, {
      comparable: comparable && sum(clicksBefore) > 0,
      minBase: 0,
    }),
  }
}

export interface FunnelStep {
  key: string
  label: string
  value: number
  /** Share of the first step, 0–1. The first step is always 1. */
  shareOfTop: number
}

/**
 * The board's reason for existing, as four steps.
 *
 * Each step is a subset of the one above it by construction — every click
 * follows a view, every apply click follows a click — so the widths are
 * comparable and the drop-off between any two rows is a real loss rather than
 * two unrelated counts drawn at different lengths.
 *
 * The last step is a floor rather than a total — a visitor who applies and
 * never comes back is never counted — which is why the tiles above report the
 * apply *rate* instead, and nothing on the page is planned around this number.
 */
export function funnelSteps(actions: ActionCounts): FunnelStep[] {
  const steps = [
    { key: 'view', label: 'Viewed a job', value: actions.view.events },
    { key: 'click', label: 'Opened the listing', value: actions.click.events },
    { key: 'apply', label: 'Clicked apply', value: actions.apply.events },
    { key: 'apply_confirmed', label: 'Confirmed applying', value: actions.apply_confirmed.events },
  ]

  const top = steps[0].value

  return steps.map((step) => ({
    ...step,
    shareOfTop: top === 0 ? 0 : step.value / top,
  }))
}

function safeRatio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}
