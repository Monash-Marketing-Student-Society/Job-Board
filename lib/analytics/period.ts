import { RANGE_GRANULARITY, RANGES, REPORTING_TIMEZONE } from './constants'
import type { AnalyticsRange } from './constants'
import type { Granularity } from '@/lib/types'

/**
 * The window every figure on the dashboard is cut from.
 *
 * Two shapes reach this module: one of the three presets (`?range=30d`), or a
 * pair of dates (`?from=2026-08-01&to=2026-08-31`). Both become the same thing
 * — a bucket count and an offset — because that is what the SQL takes:
 *
 *     days        how long the window is
 *     offsetDays  how far back it ends; 0 means "ending today"
 *
 * Resolution is total by construction. Anything unparseable, backwards,
 * in the future, or longer than the cap falls back to the default preset
 * rather than reaching a Postgres function as a number nobody checked.
 */

/** en-CA formats as YYYY-MM-DD, which is the shape the URL and inputs use. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const MS_PER_DAY = 86_400_000

/**
 * Longest custom window.
 *
 * A custom range is always drawn day by day — its edges are arbitrary dates, so
 * rolling it up to weeks would move them to week boundaries and quietly report
 * a different window than the one that was asked for. Ninety-odd daily points
 * is around the limit of what that chart can say; past it the three-month
 * preset exists and is drawn weekly precisely because it is readable that way.
 */
export const MAX_CUSTOM_DAYS = 92

export interface ChartCadence {
  granularity: Granularity
  buckets: number
  /** Whole buckets back from now that the chart's last point sits. */
  offset: number
  /** "Daily" or "Weekly" — what one point covers. */
  cadence: string
}

export interface Period {
  /** Cache key, and what the picker compares against to mark the active row. */
  key: string
  /** For the control: "Last 3 months", "1 – 31 August 2026". */
  label: string
  /** Just the length, for "versus the previous 3 months". */
  spanLabel: string
  days: number
  offsetDays: number
  chart: ChartCadence
  custom: boolean
  /** Inclusive bounds as YYYY-MM-DD. Present on every period, custom or not. */
  from: string
  to: string
}

export interface PeriodParams {
  range?: string
  from?: string
  to?: string
}

/** Today's calendar date in the reporting timezone, as YYYY-MM-DD. */
export function todayInReportingZone(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: REPORTING_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/**
 * The period named by the URL, falling back to the default preset.
 *
 * Presets win when present: `?range=7d&from=…` is a preset, because the tab
 * the visitor clicked is the more recent statement of intent.
 */
export function resolvePeriod(params: PeriodParams, now: Date = new Date()): Period {
  const preset = RANGES.find((range) => range.value === params.range)
  if (preset) return fromPreset(preset.value, now)

  const custom = fromCustom(params.from, params.to, now)
  return custom ?? fromPreset(RANGES[0].value, now)
}

function fromPreset(value: AnalyticsRange, now: Date): Period {
  const preset = RANGES.find((range) => range.value === value) ?? RANGES[0]
  const today = todayInReportingZone(now)

  return {
    key: preset.value,
    label: preset.label,
    // "Last 3 months" → "3 months"; the comparison is against a window of the
    // same length, not against the same window.
    spanLabel: preset.label.replace(/^last\s+/i, ''),
    days: preset.days,
    // Every preset ends today, which is what makes them presets.
    offsetDays: 0,
    chart: { ...preset.chart, offset: 0 },
    custom: false,
    from: addDays(today, -(preset.days - 1)),
    to: today,
  }
}

/**
 * A window between two dates, inclusive of both.
 *
 * Returns null rather than a corrected window when the pair does not describe
 * one — a silently adjusted range is worse than the default, because the
 * figures would be real and the period they belong to would not be the one on
 * screen.
 */
function fromCustom(from: unknown, to: unknown, now: Date): Period | null {
  if (typeof from !== 'string' || typeof to !== 'string') return null
  if (!ISO_DATE.test(from) || !ISO_DATE.test(to)) return null
  if (!isRealDate(from) || !isRealDate(to)) return null

  const today = todayInReportingZone(now)
  if (from > to) return null
  // There is no data from the future, and a window that ends there would
  // report a run of empty buckets as a collapse in traffic.
  if (to > today) return null

  const days = daysBetween(from, to) + 1
  if (days > MAX_CUSTOM_DAYS) return null

  return {
    key: `custom:${from}:${to}`,
    label: formatRange(from, to),
    spanLabel: `${days} ${days === 1 ? 'day' : 'days'}`,
    days,
    offsetDays: daysBetween(to, today),
    chart: {
      granularity: RANGE_GRANULARITY,
      buckets: days,
      offset: daysBetween(to, today),
      cadence: 'Daily',
    },
    custom: true,
    from,
    to,
  }
}

/** "1 – 31 August 2026", or "28 July – 3 August 2026" across a boundary. */
export function formatRange(from: string, to: string): string {
  const start = parseISO(from)
  const end = parseISO(to)

  const sameYear = start.getUTCFullYear() === end.getUTCFullYear()
  const sameMonth = sameYear && start.getUTCMonth() === end.getUTCMonth()

  const day = (date: Date) => String(date.getUTCDate())
  const monthYear = (date: Date) =>
    new Intl.DateTimeFormat('en-AU', {
      timeZone: 'UTC',
      month: 'long',
      year: 'numeric',
    }).format(date)
  const month = (date: Date) =>
    new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', month: 'long' }).format(date)

  if (sameMonth) return `${day(start)} – ${day(end)} ${monthYear(end)}`
  if (sameYear) return `${day(start)} ${month(start)} – ${day(end)} ${monthYear(end)}`

  return `${day(start)} ${monthYear(start)} – ${day(end)} ${monthYear(end)}`
}

/** Whole days from `from` to `to`, both YYYY-MM-DD. Calendar arithmetic only. */
export function daysBetween(from: string, to: string): number {
  return Math.round((parseISO(to).getTime() - parseISO(from).getTime()) / MS_PER_DAY)
}

/** Shift a YYYY-MM-DD date by whole days, staying on the calendar. */
export function addDays(date: string, days: number): string {
  const shifted = new Date(parseISO(date).getTime() + days * MS_PER_DAY)
  return shifted.toISOString().slice(0, 10)
}

/**
 * Parsed as UTC midnight on purpose.
 *
 * These are calendar dates, not instants: the difference between two of them
 * is a number of days regardless of timezone, and parsing them in the local
 * zone is how "31 August" becomes "30 August" on a machine set to UTC−5.
 */
function parseISO(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`)
}

/** Rejects 2026-02-30 and friends, which `Date` would happily roll over. */
function isRealDate(date: string): boolean {
  const parsed = parseISO(date)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date
}
