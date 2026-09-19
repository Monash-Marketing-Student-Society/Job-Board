import { EVENT_TYPES, REPORTING_TIMEZONE } from './constants'
import type {
  ActionCountRow,
  ActionCounts,
  AnalyticsEventType,
  Granularity,
  InterestRow,
  ViewerBucket,
} from '@/lib/types'

/**
 * Time-bucketing and shaping logic for the analytics dashboard.
 *
 * The heavy aggregation runs in Postgres (see 0006_analytics_events.sql). What
 * lives here is the part that has to agree with it exactly — where a bucket
 * starts, what it is called, and how a sparse result set becomes a dense chart
 * series. Keeping it pure and free of any database or React dependency is what
 * makes it testable, and bucket boundaries are exactly the kind of thing that
 * is quietly wrong until someone tests a DST weekend.
 *
 * Everything is computed in `REPORTING_TIMEZONE`, not UTC. No date library is
 * used because the project has none, and `Intl` covers it.
 */

const MS_PER_DAY = 86_400_000

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

interface ZonedParts {
  year: number
  month: number // 1-12
  day: number
}

const partsFormatter = (timeZone: string) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

/** Formatters are expensive to build and are reused across every call. */
const formatterCache = new Map<string, Intl.DateTimeFormat>()

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  let cached = formatterCache.get(timeZone)
  if (!cached) {
    cached = partsFormatter(timeZone)
    formatterCache.set(timeZone, cached)
  }
  return cached
}

function readParts(date: Date, timeZone: string) {
  const parts = getFormatter(timeZone).formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value)

  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  }
}

/** The zone's UTC offset at a given instant, in milliseconds. */
function offsetMs(date: Date, timeZone: string): number {
  const p = readParts(date, timeZone)
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return asIfUtc - date.getTime()
}

/**
 * The instant at which the given local wall-clock date began in `timeZone`.
 *
 * Resolved twice on purpose. The first pass uses the offset at the wrong
 * instant, which is off by an hour for any date near a daylight-saving change;
 * the second pass uses the offset at the corrected instant and settles. Without
 * that, every bucket in Melbourne's October–April window lands an hour early.
 */
function startOfLocalDay({ year, month, day }: ZonedParts, timeZone: string): Date {
  const wallClock = Date.UTC(year, month - 1, day)
  let instant = wallClock - offsetMs(new Date(wallClock), timeZone)
  instant = wallClock - offsetMs(new Date(instant), timeZone)
  return new Date(instant)
}

/** The calendar date, in `timeZone`, that the given instant falls on. */
function localDate(date: Date, timeZone: string): ZonedParts {
  const { year, month, day } = readParts(date, timeZone)
  return { year, month, day }
}

/** Day of week for a calendar date, Monday = 0. Pure calendar arithmetic. */
function isoWeekday({ year, month, day }: ZonedParts): number {
  return (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7
}

/**
 * Start of the bucket containing `date`.
 *
 * Weeks start Monday, matching Postgres `date_trunc('week', ...)` — the two
 * have to agree or the client-side gap fill will not line up with the rows the
 * database returns.
 */
export function bucketStart(
  granularity: Granularity,
  date: Date,
  timeZone: string = REPORTING_TIMEZONE
): Date {
  const local = localDate(date, timeZone)

  switch (granularity) {
    case 'day':
      return startOfLocalDay(local, timeZone)
    case 'week': {
      const shifted = new Date(
        Date.UTC(local.year, local.month - 1, local.day) - isoWeekday(local) * MS_PER_DAY
      )
      return startOfLocalDay(
        {
          year: shifted.getUTCFullYear(),
          month: shifted.getUTCMonth() + 1,
          day: shifted.getUTCDate(),
        },
        timeZone
      )
    }
    case 'month':
      return startOfLocalDay({ year: local.year, month: local.month, day: 1 }, timeZone)
    case 'quarter':
      return startOfLocalDay(
        { year: local.year, month: Math.floor((local.month - 1) / 3) * 3 + 1, day: 1 },
        timeZone
      )
    case 'year':
      return startOfLocalDay({ year: local.year, month: 1, day: 1 }, timeZone)
  }
}

/**
 * Move `count` whole buckets from a bucket start (negative goes back).
 *
 * Done in calendar space rather than by subtracting fixed milliseconds, so a
 * week that contains a daylight-saving change is still one week and a month is
 * still a month regardless of length.
 */
export function shiftBucket(
  granularity: Granularity,
  bucket: Date,
  count: number,
  timeZone: string = REPORTING_TIMEZONE
): Date {
  const local = localDate(bucket, timeZone)

  switch (granularity) {
    case 'day':
    case 'week': {
      const days = granularity === 'week' ? count * 7 : count
      const shifted = new Date(
        Date.UTC(local.year, local.month - 1, local.day) + days * MS_PER_DAY
      )
      return startOfLocalDay(
        {
          year: shifted.getUTCFullYear(),
          month: shifted.getUTCMonth() + 1,
          day: shifted.getUTCDate(),
        },
        timeZone
      )
    }
    case 'month':
    case 'quarter': {
      const step = granularity === 'quarter' ? 3 : 1
      const monthIndex = local.year * 12 + (local.month - 1) + count * step
      return startOfLocalDay(
        { year: Math.floor(monthIndex / 12), month: (monthIndex % 12) + 1, day: 1 },
        timeZone
      )
    }
    case 'year':
      return startOfLocalDay({ year: local.year + count, month: 1, day: 1 }, timeZone)
  }
}

/**
 * The half-open window `[start, end)` covering the most recent `count` buckets,
 * including the one `now` falls in.
 */
export function bucketWindow(
  granularity: Granularity,
  count: number,
  now: Date,
  timeZone: string = REPORTING_TIMEZONE
): { start: Date; end: Date } {
  const buckets = Math.max(1, Math.trunc(count))
  const current = bucketStart(granularity, now, timeZone)

  return {
    start: shiftBucket(granularity, current, -(buckets - 1), timeZone),
    end: shiftBucket(granularity, current, 1, timeZone),
  }
}

/**
 * Every bucket start in the window, oldest first.
 *
 * `offsetBuckets` slides the whole window back without changing its length —
 * 0 ends at the current bucket, 7 ends a week ago — mirroring the
 * `p_offset_buckets` argument the SQL takes (0023), so a client-side series
 * and the rows the database returns describe the same window.
 */
export function bucketSeries(
  granularity: Granularity,
  count: number,
  now: Date,
  timeZone: string = REPORTING_TIMEZONE,
  offsetBuckets = 0
): Date[] {
  const buckets = Math.max(1, Math.trunc(count))
  const offset = Math.max(0, Math.trunc(offsetBuckets))
  const current = bucketStart(granularity, now, timeZone)

  return Array.from({ length: buckets }, (_, i) =>
    shiftBucket(granularity, current, i - (buckets - 1) - offset, timeZone)
  )
}

/**
 * Axis label for a bucket.
 *
 * One convention across the whole dashboard, keyed off granularity:
 * `12-03` (day and week), `March 2026` (month and quarter), `2026` (year).
 */
export function bucketLabel(
  granularity: Granularity,
  bucket: Date,
  timeZone: string = REPORTING_TIMEZONE
): string {
  const local = localDate(bucket, timeZone)
  const month = MONTH_NAMES[local.month - 1]

  switch (granularity) {
    // Day-month, zero-padded, and the same shape for both cadences — a week
    // is labelled by the day it opens. Fixed-width is the point: "8 June" and
    // "24 September" are nine characters apart, so a row of them can only be
    // spaced evenly by accident, and the axis ends up looking arranged by
    // hand. Every label here is five characters wide.
    //
    // Neither carries a year. Across ninety days it is never in doubt, and the
    // table under the chart has the full date for anyone who needs it.
    case 'day':
    case 'week':
      return `${pad(local.day)}-${pad(local.month)}`

    // Quarters are labelled by their opening month rather than "Q3 2026". Note
    // this makes a quarter bucket visually identical to a month bucket; the
    // card heading and the granularity control are what disambiguate them.
    case 'month':
    case 'quarter':
      return `${month} ${local.year}`

    case 'year':
      return String(local.year)
  }
}

/** Two digits, so every label on the axis is the same width. */
function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/**
 * Evenly spaced x-axis ticks, anchored to the most recent bucket.
 *
 * Recharts' own thinning (`interval="preserveStartEnd"` with a minimum gap)
 * decides tick by tick whether the next label would collide, which on thirteen
 * weekly buckets produced 22 June, 6 July, 13, 20, 27, 10 August, 24 August,
 * 14 September — gaps of two weeks, then one, then one, then two. Every label
 * was true and the row of them was noise, because uneven spacing reads as
 * uneven *time*.
 *
 * This picks one stride and holds it, walking back from the newest bucket so
 * the right-hand edge — the date a reader looks at first — is always labelled.
 * When the stride does not divide the window exactly, the remainder is left
 * unlabelled at the left edge rather than spent on a closer pair somewhere in
 * the middle.
 */
export function evenlySpacedTicks(labels: string[], maxTicks = 7): string[] {
  if (labels.length <= maxTicks) return labels

  const stride = Math.ceil((labels.length - 1) / (maxTicks - 1))
  const ticks: string[] = []

  for (let i = labels.length - 1; i >= 0; i -= stride) ticks.unshift(labels[i])

  return ticks
}

export interface FilledBucket {
  bucketStart: string
  label: string
  viewers: number
  views: number
}

/**
 * Expand a sparse result set into one entry per bucket, zero-filling gaps.
 *
 * The SQL already gap-fills, so in practice this is a second line of defence —
 * but it is the line that matters, because a missing bucket does not render as
 * an obvious hole. It renders as a chart where two non-adjacent periods sit
 * side by side and a quiet month silently disappears.
 */
export function fillBuckets(
  rows: ViewerBucket[],
  granularity: Granularity,
  count: number,
  now: Date,
  timeZone: string = REPORTING_TIMEZONE,
  offsetBuckets = 0
): FilledBucket[] {
  const byInstant = new Map<number, ViewerBucket>()
  for (const row of rows) {
    const instant = new Date(row.bucket_start).getTime()
    if (!Number.isNaN(instant)) byInstant.set(instant, row)
  }

  return bucketSeries(granularity, count, now, timeZone, offsetBuckets).map((bucket) => {
    const row = byInstant.get(bucket.getTime())
    return {
      bucketStart: bucket.toISOString(),
      label: bucketLabel(granularity, bucket, timeZone),
      viewers: row?.viewers ?? 0,
      views: row?.views ?? 0,
    }
  })
}

/** One row of `analytics_actions_by_bucket` (0021). */
export interface ActionBucketRow {
  bucket_start: string
  action: string
  events: number
}

/**
 * Turn per-bucket action rows into one dense series per event type.
 *
 * Same contract as `fillBuckets`: the caller gets exactly `count` values per
 * action, oldest first, regardless of what the database sent. The SQL already
 * zero-fills both dimensions, so this is the second line of defence — but it is
 * also what guarantees every series is the same length, which the tiles rely on
 * when they cut a double-length window in half.
 */
export function fillActionSeries(
  rows: ActionBucketRow[] | null | undefined,
  granularity: Granularity,
  count: number,
  now: Date,
  timeZone: string = REPORTING_TIMEZONE,
  offsetBuckets = 0
): Record<AnalyticsEventType, number[]> {
  const byAction = new Map<string, Map<number, number>>()

  for (const row of rows ?? []) {
    const instant = new Date(row.bucket_start).getTime()
    if (Number.isNaN(instant)) continue

    const series = byAction.get(row.action) ?? new Map<number, number>()
    series.set(instant, Number(row.events) || 0)
    byAction.set(row.action, series)
  }

  const buckets = bucketSeries(granularity, count, now, timeZone, offsetBuckets)

  return Object.fromEntries(
    EVENT_TYPES.map((type) => {
      const series = byAction.get(type)
      return [type, buckets.map((bucket) => series?.get(bucket.getTime()) ?? 0)]
    })
  ) as Record<AnalyticsEventType, number[]>
}

const EMPTY_COUNT = { events: 0, distinct_jobs: 0, visitors: 0 }

/**
 * Densify the action counters so all four are always present.
 *
 * Postgres returns no row at all for an action nobody performed, which would
 * render as a missing tile rather than a zero. Unknown actions are dropped
 * rather than thrown on: a future event type should not take the dashboard down.
 */
export function normalizeActionCounts(rows: ActionCountRow[] | null | undefined): ActionCounts {
  const counts = Object.fromEntries(
    EVENT_TYPES.map((type) => [type, { ...EMPTY_COUNT }])
  ) as ActionCounts

  for (const row of rows ?? []) {
    if (!EVENT_TYPES.includes(row.action as AnalyticsEventType)) continue
    counts[row.action] = {
      events: Number(row.events) || 0,
      distinct_jobs: Number(row.distinct_jobs) || 0,
      visitors: Number(row.visitors) || 0,
    }
  }

  return counts
}

export interface InterestSlice {
  label: string
  events: number
  visitors: number
}

/**
 * Top interest categories for one dimension, with the tail folded into "Other".
 *
 * Ties break on label so the order is stable between renders — otherwise two
 * tags on equal counts can swap places on every refresh and look like movement.
 * The "Other" row is kept rather than discarded so the bars still sum to the
 * real total.
 */
/**
 * Every label in a vocabulary, whether or not anybody touched it.
 *
 * The interest breakdown only knows about labels that produced an event, so a
 * tag nothing was tagged with — or a tag nobody opened — simply is not in the
 * result. For the bars that is right: an empty row is a row of nothing. For the
 * table under them it is not, because "which of our tags got no interest at
 * all this period" is a real question, and a missing row answers it only if the
 * reader already knows the whole vocabulary by heart.
 *
 * Labels present in the data but absent from the vocabulary are kept rather
 * than dropped: tag membership has only been enforced since 0018, and history
 * predating it still carries what it carries.
 */
export function withVocabulary(
  slices: InterestSlice[],
  vocabulary: readonly string[]
): InterestSlice[] {
  const byLabel = new Map(slices.map((slice) => [slice.label, slice]))

  for (const label of vocabulary) {
    if (!byLabel.has(label)) byLabel.set(label, { label, events: 0, visitors: 0 })
  }

  return [...byLabel.values()].sort(
    (a, b) => b.events - a.events || a.label.localeCompare(b.label)
  )
}

export function topInterests(
  rows: InterestRow[] | null | undefined,
  dimension: InterestRow['dimension'],
  limit: number
): InterestSlice[] {
  const scoped = (rows ?? [])
    .filter((row) => row.dimension === dimension && row.label)
    .map((row) => ({
      label: row.label,
      events: Number(row.events) || 0,
      visitors: Number(row.visitors) || 0,
    }))
    .sort((a, b) => b.events - a.events || a.label.localeCompare(b.label))

  const max = Math.max(1, Math.trunc(limit))
  if (scoped.length <= max) return scoped

  const head = scoped.slice(0, max)
  const tail = scoped.slice(max)

  return [
    ...head,
    {
      label: 'Other',
      events: tail.reduce((sum, row) => sum + row.events, 0),
      // Visitors are not additive across labels — the same person can appear
      // under several tags — so this is a ceiling, not a count. It is only ever
      // shown as a tooltip detail on the folded row.
      visitors: tail.reduce((sum, row) => sum + row.visitors, 0),
    },
  ]
}
