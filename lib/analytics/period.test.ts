import { describe, it, expect } from 'vitest'
import {
  MAX_CUSTOM_DAYS,
  addDays,
  daysBetween,
  formatRange,
  resolvePeriod,
  todayInReportingZone,
} from './period'

/** 10am Melbourne on 15 September 2026. */
const NOW = new Date('2026-09-15T00:00:00Z')

describe('resolvePeriod — presets', () => {
  it('reads a preset off the URL', () => {
    const period = resolvePeriod({ range: '30d' }, NOW)

    expect(period.key).toBe('30d')
    expect(period.label).toBe('Last 30 days')
    expect(period.days).toBe(30)
    expect(period.custom).toBe(false)
  })

  it('ends every preset today, which is what makes it a preset', () => {
    for (const range of ['7d', '30d', '90d']) {
      expect(resolvePeriod({ range }, NOW).offsetDays).toBe(0)
      expect(resolvePeriod({ range }, NOW).to).toBe(todayInReportingZone(NOW))
    }
  })

  it('counts the window inclusively, so "last 7 days" includes today', () => {
    const period = resolvePeriod({ range: '7d' }, NOW)

    expect(daysBetween(period.from, period.to)).toBe(6)
    expect(period.days).toBe(7)
  })

  it('falls back to the widest preset for an unknown range', () => {
    expect(resolvePeriod({ range: 'yesterday' }, NOW).key).toBe('90d')
    expect(resolvePeriod({}, NOW).key).toBe('90d')
  })

  it('lets a preset win over dates left in the address', () => {
    // The tab is the more recent statement of intent than a stale ?from=.
    const period = resolvePeriod(
      { range: '7d', from: '2026-01-01', to: '2026-01-31' },
      NOW
    )

    expect(period.key).toBe('7d')
  })
})

describe('resolvePeriod — custom windows', () => {
  it('turns a pair of dates into a length and an offset', () => {
    const period = resolvePeriod({ from: '2026-08-01', to: '2026-08-31' }, NOW)

    expect(period.custom).toBe(true)
    expect(period.days).toBe(31)
    // 31 August to 15 September.
    expect(period.offsetDays).toBe(15)
    expect(period.key).toBe('custom:2026-08-01:2026-08-31')
  })

  it('always draws a custom window day by day', () => {
    // Rolling an arbitrary window up to weeks would move its edges to week
    // boundaries and report a different window than the one asked for.
    const period = resolvePeriod({ from: '2026-07-01', to: '2026-08-31' }, NOW)

    expect(period.chart.granularity).toBe('day')
    expect(period.chart.buckets).toBe(period.days)
    expect(period.chart.offset).toBe(period.offsetDays)
  })

  it('reports a single day as one bucket, not zero', () => {
    const period = resolvePeriod({ from: '2026-09-01', to: '2026-09-01' }, NOW)

    expect(period.days).toBe(1)
    expect(period.offsetDays).toBe(14)
  })

  describe('rejects rather than corrects', () => {
    // A silently adjusted range is worse than the default: the figures would be
    // real and the period on screen would not be the one they belong to.
    const cases: [string, { from?: string; to?: string }][] = [
      ['a backwards pair', { from: '2026-08-31', to: '2026-08-01' }],
      ['an end date in the future', { from: '2026-09-01', to: '2026-12-01' }],
      ['a window past the cap', { from: '2026-01-01', to: '2026-06-01' }],
      ['a date that does not exist', { from: '2026-02-30', to: '2026-03-05' }],
      ['a malformed date', { from: '01-08-2026', to: '2026-08-31' }],
      ['half a range', { from: '2026-08-01' }],
      ['nothing at all', {}],
    ]

    for (const [name, params] of cases) {
      it(name, () => {
        const period = resolvePeriod(params, NOW)
        expect(period.custom).toBe(false)
        expect(period.key).toBe('90d')
      })
    }
  })

  it('accepts a window exactly at the cap', () => {
    const to = '2026-09-01'
    const from = addDays(to, -(MAX_CUSTOM_DAYS - 1))

    expect(resolvePeriod({ from, to }, NOW).days).toBe(MAX_CUSTOM_DAYS)
  })
})

describe('formatRange', () => {
  it('names the month once when both dates share it', () => {
    expect(formatRange('2026-08-01', '2026-08-31')).toBe('1 – 31 August 2026')
  })

  it('names both months across a boundary, and the year once', () => {
    expect(formatRange('2026-07-28', '2026-08-03')).toBe('28 July – 3 August 2026')
  })

  it('names both years across a new year', () => {
    expect(formatRange('2025-12-28', '2026-01-03')).toBe(
      '28 December 2025 – 3 January 2026'
    )
  })
})

describe('calendar arithmetic', () => {
  it('counts whole days between two dates', () => {
    expect(daysBetween('2026-08-01', '2026-08-31')).toBe(30)
    expect(daysBetween('2026-08-31', '2026-08-01')).toBe(-30)
  })

  it('crosses a month and a year boundary', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('does not drift across a Melbourne daylight-saving change', () => {
    // Clocks go forward on 4 October 2026. These are calendar dates, so the
    // hour that disappears must not turn 5 October into 4 October.
    expect(daysBetween('2026-10-01', '2026-10-08')).toBe(7)
    expect(addDays('2026-10-03', 2)).toBe('2026-10-05')
  })
})
