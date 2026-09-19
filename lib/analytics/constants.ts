import type { AnalyticsEventType, Granularity } from '@/lib/types'

/**
 * First-party cookie identifying an anonymous visitor.
 *
 * Lives in its own module because three runtimes need it — Edge middleware
 * mints it, the Node route handler reads it, and the browser tracker relies on
 * it existing — and none of them should have to import the others.
 */
export const VISITOR_COOKIE = 'mmss_vid'

/** One year. Long enough that "viewers this quarter" means returning people. */
export const VISITOR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export const EVENT_TYPES: readonly AnalyticsEventType[] = [
  'view',
  'click',
  'apply',
  'apply_confirmed',
  'share',
  'dwell',
]

/**
 * The dashboard's one time period.
 *
 * There used to be two controls: a granularity select (Weekly/Monthly/…) that
 * decided what the server aggregated, and a range tab strip on the Total
 * Visitors card that sliced its own series. Two controls over one page's sense
 * of "when" meant the tiles could be reporting a quarter while the chart beside
 * them showed a week — nothing on screen said which period any given number
 * belonged to. This list is now the only answer to that question, and every
 * figure on the page is cut from it.
 */
export const RANGES = [
  {
    value: '90d',
    label: 'Last 3 months',
    days: 90,
    // Ninety daily points in one card is a band of noise: the weekday rhythm
    // swamps the trend, and the line the reader came for is the one thing they
    // cannot see. Over this range the chart asks the database for thirteen
    // weekly buckets instead. Note this is a second query rather than a
    // client-side regrouping of the daily rows, and it has to be: distinct
    // viewers are not additive, so a week's viewers is something only the
    // database can count — summing seven daily figures would report the same
    // person seven times.
    chart: { granularity: 'week', buckets: 13, cadence: 'Weekly' },
  },
  { value: '30d', label: 'Last 30 days', days: 30, chart: { granularity: 'day', buckets: 30, cadence: 'Daily' } },
  { value: '7d', label: 'Last 7 days', days: 7, chart: { granularity: 'day', buckets: 7, cadence: 'Daily' } },
] as const

export type RangeOption = (typeof RANGES)[number]
export type AnalyticsRange = RangeOption['value']

/** Widest first, so the default shows the most history. */
export const DEFAULT_RANGE: AnalyticsRange = RANGES[0].value

/**
 * Every window is cut into days.
 *
 * With the granularity picker gone there is one bucket size, which is what
 * makes the ranges comparable: 90 daily points, 30, or 7. The coarser
 * granularities still exist in `bucketStart` and friends — the SQL takes them,
 * and a future report may want them — they are simply not something this page
 * asks a reader to choose between any more.
 */
export const RANGE_GRANULARITY: Granularity = 'day'

/**
 * Buckets are cut in Melbourne time, not UTC.
 *
 * This is a Monash society's job board: "this week" has to mean the week its
 * students are living in, or every Monday-morning number lands in the previous
 * bucket.
 */
export const REPORTING_TIMEZONE = 'Australia/Melbourne'

/**
 * Human labels.
 *
 * "Apply clicks" and "Applications" are deliberately different things: the
 * first is a visitor leaving for the employer, the second is a visitor coming
 * back and confirming they finished. Never collapse them into one number.
 */
export const ACTION_LABELS: Record<AnalyticsEventType, string> = {
  view: 'Page Views',
  click: 'Job clicks',
  apply: 'Apply clicks',
  apply_confirmed: 'Applications',
  share: 'Shares',
  // Never tiled as a count — the number of times somebody left a listing is
  // not interesting. The measurement it carries is (see `duration_ms`).
  dwell: 'Time on page',
}

/**
 * How long after an apply click the confirmation prompt stays relevant.
 *
 * The lower bound keeps the prompt from appearing while the employer's tab is
 * still opening — asking "did you apply?" two seconds after the click reads as
 * broken. The upper bound stops us asking about something from last week, which
 * the visitor will not remember accurately.
 */
/**
 * Bounds on a single `dwell` measurement, mirrored by the table's CHECK.
 *
 * Under a second is an accidental open, not a read. Over thirty minutes is a
 * tab someone walked away from, and one of those would otherwise own the
 * average for the whole day.
 */
export const DWELL_MIN_MS = 1_000
export const DWELL_MAX_MS = 30 * 60 * 1000

export const APPLY_CONFIRM_MIN_AGE_MS = 45_000
export const APPLY_CONFIRM_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000
