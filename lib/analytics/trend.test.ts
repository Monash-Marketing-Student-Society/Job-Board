import { describe, it, expect } from 'vitest'
import { MIN_TREND_BASE, ratioSeries, splitWindows, trendBetween } from './trend'

describe('trendBetween — the movement figure on a tile', () => {
  it('reports growth against the previous window', () => {
    expect(trendBetween(144, 100)).toEqual({ changePct: 44, direction: 'up' })
  })

  it('reports a fall as a negative figure, not an absolute one', () => {
    expect(trendBetween(82, 100)).toEqual({ changePct: -18, direction: 'down' })
  })

  it('keeps one decimal, because whole percents hide real movement', () => {
    expect(trendBetween(1446, 1000).changePct).toBe(44.6)
  })

  it('calls an unchanged figure flat rather than "up 0%"', () => {
    expect(trendBetween(100, 100)).toEqual({ changePct: 0, direction: 'flat' })
  })

  it('claims nothing when the previous window is too small to divide by', () => {
    // One extra click on a base of three is "+33%", which reads as a trend and
    // is noise. The floor is what stops the tile making that claim.
    const trend = trendBetween(4, MIN_TREND_BASE - 1)

    expect(trend).toEqual({ changePct: null, direction: 'insufficient' })
  })

  it('claims nothing when history does not cover the comparison window', () => {
    // The widest range compares against a window that can start before the
    // first event ever recorded; dividing by that gap invents a trend.
    expect(trendBetween(5000, 12, { comparable: false }).changePct).toBeNull()
  })

  it('treats a zero previous window as insufficient, never as infinite growth', () => {
    expect(trendBetween(240, 0).direction).toBe('insufficient')
  })
})

describe('splitWindows — cutting a double-length series in half', () => {
  it('returns the comparison window first and the reported window second', () => {
    expect(splitWindows([1, 2, 3, 4, 5, 6])).toEqual([
      [1, 2, 3],
      [4, 5, 6],
    ])
  })

  it('gives an odd extra bucket to the window being reported', () => {
    const [previous, current] = splitWindows([1, 2, 3, 4, 5])

    expect(previous).toEqual([1, 2])
    expect(current).toEqual([3, 4, 5])
  })

  it('survives an empty series', () => {
    expect(splitWindows([])).toEqual([[], []])
  })
})

describe('ratioSeries — per-day depth', () => {
  it('divides bucket by bucket', () => {
    expect(ratioSeries([10, 9], [5, 3])).toEqual([2, 3])
  })

  it('reads a day with no viewers as zero, not as infinity', () => {
    expect(ratioSeries([4, 7], [0, 0])).toEqual([0, 0])
  })

  it('treats a missing denominator bucket as an empty one', () => {
    expect(ratioSeries([4, 7], [2])).toEqual([2, 0])
  })
})
