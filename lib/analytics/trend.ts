/**
 * Period-over-period movement for a single headline figure.
 *
 * `growth.ts` answers the same question about a *category* ("which job type is
 * rising"); this answers it about one measure ("clicks, against the equal-length
 * window before this one"). They are deliberately separate: the category version
 * has to pick a leader and name it in a sentence, this one only ever produces a
 * number and a direction for a tile to render.
 */

export type TrendDirection = 'up' | 'down' | 'flat' | 'insufficient'

export interface Trend {
  /** Rounded to one decimal. Null whenever no honest comparison exists. */
  changePct: number | null
  direction: TrendDirection
}

/**
 * How large the previous window has to be before a percentage means anything.
 *
 * Lower than `MIN_GROWTH_BASE` in growth.ts (20) because these are whole-board
 * totals rather than one category's slice, and the rarest of them — confirmed
 * applications — is genuinely a small number on a student job board. Below ten,
 * though, a single extra click reads as "+20%", which is noise wearing a
 * trend's clothing.
 */
export const MIN_TREND_BASE = 10

export const NO_TREND: Trend = { changePct: null, direction: 'insufficient' }

/**
 * Movement from `previous` to `current`.
 *
 * `comparable` is the caller's answer to "does tracked history actually cover
 * the previous window?" — see the same argument in `growthInsight`. On the
 * widest range the comparison window can start before the first event ever
 * recorded, and dividing by that empty stretch produces figures like "+5400%",
 * which is not growth but the absence of history.
 */
export function trendBetween(
  current: number,
  previous: number,
  {
    comparable = true,
    /**
     * Override for measures whose base is not a count of anything.
     * "Views per viewer" moving from 1.9 to 2.4 is a real 26% change, but a
     * base of 1.9 is under any count-shaped floor — so the ratio tiles pass 0
     * here and rely on `comparable` alone.
     */
    minBase = MIN_TREND_BASE,
  }: { comparable?: boolean; minBase?: number } = {}
): Trend {
  if (!comparable) return NO_TREND
  // Zero is always insufficient regardless of the floor: there is no
  // percentage change from nothing, only a first value.
  if (previous <= 0) return NO_TREND
  if (previous < minBase) return NO_TREND

  const changePct = round1(((current - previous) / previous) * 100)

  if (changePct === 0) return { changePct: 0, direction: 'flat' }

  return { changePct, direction: changePct > 0 ? 'up' : 'down' }
}

/**
 * Split a double-length series into [previous window, current window].
 *
 * The dashboard asks the database for twice the reported range in one call, so
 * the comparison window arrives in the same array as the window on screen.
 * Odd lengths give the extra bucket to the current window, which is the one
 * being reported.
 */
export function splitWindows<T>(series: T[]): [T[], T[]] {
  const half = Math.floor(series.length / 2)
  return [series.slice(0, half), series.slice(half)]
}

export function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

export function mean(values: number[]): number {
  return values.length === 0 ? 0 : sum(values) / values.length
}

/**
 * Per-bucket ratio of two series, guarding the empty buckets.
 *
 * Used for "views per viewer": a day with no viewers is not a day with an
 * infinite ratio, it is a day with nothing to say, so it contributes zero
 * rather than dividing by zero.
 */
export function ratioSeries(numerators: number[], denominators: number[]): number[] {
  return numerators.map((value, index) => {
    const denominator = denominators[index] ?? 0
    return denominator === 0 ? 0 : value / denominator
  })
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}
