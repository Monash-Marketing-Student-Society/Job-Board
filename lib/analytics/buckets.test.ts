import { describe, it, expect } from 'vitest'
import { EVENT_TYPES } from './constants'
import {
  bucketStart,
  shiftBucket,
  bucketWindow,
  bucketSeries,
  bucketLabel,
  fillBuckets,
  normalizeActionCounts,
  topInterests,
  withVocabulary,
  evenlySpacedTicks,
  fillActionSeries,
} from './buckets'
import type { ActionCountRow, InterestRow, ViewerBucket } from '@/lib/types'

/**
 * All assertions pin an explicit `now` rather than reading the clock, so the
 * suite gives the same answer in January as in July and on a CI box set to UTC.
 *
 * The expected instants are Melbourne local midnights expressed in UTC:
 * AEST is +10 (roughly April–October) and AEDT is +11 (October–April). Where a
 * boundary sits on the wrong side of a daylight-saving change, that is the
 * point of the test.
 */
const TZ = 'Australia/Melbourne'

const iso = (d: Date) => d.toISOString()

describe('bucketStart', () => {
  describe('week', () => {
    it('starts weeks on Monday local time, matching date_trunc', () => {
      // Monday 10 Aug 2026, 3pm AEST.
      const monday = new Date('2026-08-10T05:00:00Z')
      expect(iso(bucketStart('week', monday, TZ))).toBe('2026-08-09T14:00:00.000Z')
    })

    it('pulls a Sunday back to the preceding Monday, not forward', () => {
      // Sunday 16 Aug 2026 — ISO weeks end on Sunday, so this belongs to the
      // week beginning Monday 10 Aug.
      const sunday = new Date('2026-08-16T05:00:00Z')
      expect(iso(bucketStart('week', sunday, TZ))).toBe('2026-08-09T14:00:00.000Z')
    })

    it('uses the Melbourne day, not the UTC day', () => {
      // Sunday 09 Aug 2026 23:00 UTC is already Monday 10 Aug in Melbourne, so
      // this instant belongs to the *following* week. Bucketing in UTC would
      // file it a week early.
      const lateSundayUtc = new Date('2026-08-09T23:00:00Z')
      expect(iso(bucketStart('week', lateSundayUtc, TZ))).toBe('2026-08-09T14:00:00.000Z')
    })
  })

  describe('month', () => {
    it('truncates to the first of the month at local midnight', () => {
      const midAugust = new Date('2026-08-10T05:00:00Z')
      expect(iso(bucketStart('month', midAugust, TZ))).toBe('2026-07-31T14:00:00.000Z')
    })

    it('handles a month that begins during daylight saving', () => {
      // January is AEDT (+11), so local midnight is an hour earlier in UTC than
      // it is for the AEST months above.
      const january = new Date('2026-01-15T05:00:00Z')
      expect(iso(bucketStart('month', january, TZ))).toBe('2025-12-31T13:00:00.000Z')
    })
  })

  describe('quarter', () => {
    it.each([
      ['2026-01-15T05:00:00Z', '2025-12-31T13:00:00.000Z'], // Q1 -> 1 Jan (AEDT)
      ['2026-05-15T05:00:00Z', '2026-03-31T13:00:00.000Z'], // Q2 -> 1 Apr (AEDT)
      ['2026-08-15T05:00:00Z', '2026-06-30T14:00:00.000Z'], // Q3 -> 1 Jul (AEST)
      ['2026-11-15T05:00:00Z', '2026-09-30T14:00:00.000Z'], // Q4 -> 1 Oct (AEST)
    ])('maps %s to quarter start %s', (input, expected) => {
      expect(iso(bucketStart('quarter', new Date(input), TZ))).toBe(expected)
    })

    it('splits 31 March and 1 April into different quarters', () => {
      const q1 = bucketStart('quarter', new Date('2026-03-31T05:00:00Z'), TZ)
      const q2 = bucketStart('quarter', new Date('2026-04-01T05:00:00Z'), TZ)
      expect(iso(q1)).toBe('2025-12-31T13:00:00.000Z')
      expect(iso(q2)).toBe('2026-03-31T13:00:00.000Z')
      expect(q1.getTime()).toBeLessThan(q2.getTime())
    })
  })

  describe('year', () => {
    it('truncates to 1 January local time', () => {
      expect(iso(bucketStart('year', new Date('2026-08-10T05:00:00Z'), TZ))).toBe(
        '2025-12-31T13:00:00.000Z'
      )
    })

    it('splits 31 December 23:59 and 1 January 00:00 Melbourne time', () => {
      // 2025-12-31T12:59Z is 23:59 on 31 Dec in Melbourne (AEDT, +11).
      const lastMinute = new Date('2025-12-31T12:59:00Z')
      // One minute later is 1 Jan 2026, 00:00 local.
      const firstMinute = new Date('2025-12-31T13:00:00Z')

      expect(iso(bucketStart('year', lastMinute, TZ))).toBe('2024-12-31T13:00:00.000Z')
      expect(iso(bucketStart('year', firstMinute, TZ))).toBe('2025-12-31T13:00:00.000Z')
    })
  })
})

describe('shiftBucket — daylight saving', () => {
  it('keeps a week 7 local days long across the April DST end', () => {
    // Melbourne leaves AEDT on Sunday 5 April 2026. The week starting Mon 30
    // March begins at +11; the next begins at +10. In UTC terms that gap is 7
    // days and 1 hour — subtracting a flat 7×24h would drift the boundary off
    // local midnight.
    const weekOfDstEnd = bucketStart('week', new Date('2026-04-01T05:00:00Z'), TZ)
    const nextWeek = shiftBucket('week', weekOfDstEnd, 1, TZ)

    expect(iso(weekOfDstEnd)).toBe('2026-03-29T13:00:00.000Z')
    expect(iso(nextWeek)).toBe('2026-04-05T14:00:00.000Z')
    expect(nextWeek.getTime() - weekOfDstEnd.getTime()).toBe((7 * 24 + 1) * 3_600_000)
  })

  it('keeps a week 7 local days long across the October DST start', () => {
    // Melbourne enters AEDT on Sunday 4 October 2026: that week is an hour
    // shorter in absolute terms.
    const weekBefore = bucketStart('week', new Date('2026-09-30T05:00:00Z'), TZ)
    const weekAfter = shiftBucket('week', weekBefore, 1, TZ)

    expect(iso(weekBefore)).toBe('2026-09-27T14:00:00.000Z')
    expect(iso(weekAfter)).toBe('2026-10-04T13:00:00.000Z')
    expect(weekAfter.getTime() - weekBefore.getTime()).toBe((7 * 24 - 1) * 3_600_000)
  })

  it('lands every shifted bucket on local midnight regardless of DST', () => {
    const midnightFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: TZ,
      hourCycle: 'h23',
      hour: '2-digit',
      minute: '2-digit',
    })

    // A full year of weeks crosses both transitions.
    const start = bucketStart('week', new Date('2026-01-05T05:00:00Z'), TZ)
    for (let i = 0; i < 52; i++) {
      const bucket = shiftBucket('week', start, i, TZ)
      expect(midnightFormatter.format(bucket)).toBe('00:00')
    }
  })
})

describe('shiftBucket — calendar rollover', () => {
  it('rolls months backwards across a year boundary', () => {
    const january = bucketStart('month', new Date('2026-01-15T05:00:00Z'), TZ)
    expect(iso(shiftBucket('month', january, -1, TZ))).toBe('2025-11-30T13:00:00.000Z')
  })

  it('handles 31-day to 30-day month transitions', () => {
    // 31 days back from 1 Aug is not 1 Jul unless the arithmetic is calendrical.
    const august = bucketStart('month', new Date('2026-08-15T05:00:00Z'), TZ)
    expect(iso(shiftBucket('month', august, -1, TZ))).toBe('2026-06-30T14:00:00.000Z')
  })

  it('handles February in a leap year', () => {
    // 2028 is a leap year: Feb has 29 days, so March must still start on the 1st.
    const march = bucketStart('month', new Date('2028-03-15T05:00:00Z'), TZ)
    const february = shiftBucket('month', march, -1, TZ)
    expect(bucketLabel('month', february, TZ)).toBe('February 2028')
    expect(iso(shiftBucket('month', february, 1, TZ))).toBe(iso(march))
  })

  it('rolls quarters backwards across a year boundary', () => {
    const q1 = bucketStart('quarter', new Date('2026-02-15T05:00:00Z'), TZ)
    const q4Previous = shiftBucket('quarter', q1, -1, TZ)
    expect(bucketLabel('quarter', q4Previous, TZ)).toBe('October 2025')
    expect(iso(q4Previous)).toBe('2025-09-30T14:00:00.000Z')
  })

  it('rolls years', () => {
    const year = bucketStart('year', new Date('2026-08-10T05:00:00Z'), TZ)
    expect(bucketLabel('year', shiftBucket('year', year, -3, TZ), TZ)).toBe('2023')
  })
})

describe('bucketLabel', () => {
  it('labels months and quarters as "Month YYYY" and years as "YYYY"', () => {
    const now = new Date('2026-08-10T05:00:00Z')
    expect(bucketLabel('month', bucketStart('month', now, TZ), TZ)).toBe('August 2026')
    // A quarter is named for the month it opens, not "Q3".
    expect(bucketLabel('quarter', bucketStart('quarter', now, TZ), TZ)).toBe('July 2026')
    expect(bucketLabel('year', bucketStart('year', now, TZ), TZ)).toBe('2026')
  })

  it('labels a week by the day it opens, in DD-MM', () => {
    const week = bucketStart('week', new Date('2026-08-12T05:00:00Z'), TZ)
    expect(bucketLabel('week', week, TZ)).toBe('10-08')
  })

  it('labels a day the same way a week is labelled', () => {
    // One shape for both cadences: the axis is read the same way whether a
    // point is a day or the week it opens.
    const day = bucketStart('day', new Date('2026-08-12T05:00:00Z'), TZ)
    expect(bucketLabel('day', day, TZ)).toBe('12-08')
  })

  it('names the opening day of a week that starts in the previous year', () => {
    // Monday 29 Dec 2025 opens a week running into 2026. Under the old ISO
    // scheme this was "W1 2026"; the date says the same thing without needing
    // the reader to know ISO week numbering.
    const week = bucketStart('week', new Date('2025-12-30T05:00:00Z'), TZ)
    expect(iso(week)).toBe('2025-12-28T13:00:00.000Z')
    expect(bucketLabel('week', week, TZ)).toBe('29-12')
  })

  it('produces distinct, ordered labels across a year boundary', () => {
    const start = bucketStart('week', new Date('2025-12-08T05:00:00Z'), TZ)
    const labels = Array.from({ length: 6 }, (_, i) =>
      bucketLabel('week', shiftBucket('week', start, i, TZ), TZ)
    )
    expect(labels).toEqual(['08-12', '15-12', '22-12', '29-12', '05-01', '12-01'])
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('zero-pads, so every label on the axis is the same width', () => {
    // Fixed width is what lets the axis be spaced evenly: "5-1" beside "12-01"
    // would centre differently under its own tick.
    const week = bucketStart('week', new Date('2026-01-07T05:00:00Z'), TZ)
    expect(bucketLabel('week', week, TZ)).toBe('05-01')
  })
})

describe('bucketWindow and bucketSeries', () => {
  const now = new Date('2026-08-10T05:00:00Z')

  it.each(['week', 'month', 'quarter', 'year'] as const)(
    'returns exactly the requested number of %s buckets',
    (granularity) => {
      expect(bucketSeries(granularity, 12, now, TZ)).toHaveLength(12)
    }
  )

  it('includes the current bucket as the last entry', () => {
    const series = bucketSeries('month', 12, now, TZ)
    expect(iso(series[series.length - 1])).toBe(iso(bucketStart('month', now, TZ)))
  })

  it('returns buckets in ascending order with no duplicates', () => {
    const series = bucketSeries('week', 12, now, TZ).map((d) => d.getTime())
    expect(series).toEqual([...series].sort((a, b) => a - b))
    expect(new Set(series).size).toBe(series.length)
  })

  it('window start matches the first bucket and end excludes the current one', () => {
    const { start, end } = bucketWindow('month', 12, now, TZ)
    const series = bucketSeries('month', 12, now, TZ)

    expect(iso(start)).toBe(iso(series[0]))
    expect(end.getTime()).toBeGreaterThan(now.getTime())
    expect(iso(start)).toBe('2025-08-31T14:00:00.000Z')
  })

  it('clamps a zero or negative count to one bucket', () => {
    expect(bucketSeries('month', 0, now, TZ)).toHaveLength(1)
    expect(bucketSeries('month', -5, now, TZ)).toHaveLength(1)
  })
})

describe('fillBuckets', () => {
  const now = new Date('2026-08-10T05:00:00Z')

  it('zero-fills every bucket when there is no data at all', () => {
    const filled = fillBuckets([], 'month', 12, now, TZ)
    expect(filled).toHaveLength(12)
    expect(filled.every((b) => b.viewers === 0 && b.views === 0)).toBe(true)
  })

  it('places sparse rows in the right buckets and zero-fills the gaps', () => {
    const series = bucketSeries('month', 4, now, TZ)
    const rows: ViewerBucket[] = [
      { bucket_start: series[0].toISOString(), viewers: 7, views: 20 },
      { bucket_start: series[3].toISOString(), viewers: 3, views: 5 },
    ]

    const filled = fillBuckets(rows, 'month', 4, now, TZ)

    expect(filled.map((b) => b.viewers)).toEqual([7, 0, 0, 3])
    expect(filled.map((b) => b.views)).toEqual([20, 0, 0, 5])
  })

  it('keeps a quiet period visible rather than collapsing the series', () => {
    // The failure this guards against: a chart that silently renders 2 bars for
    // a 12-week window, making a dead patch look like it never happened.
    const series = bucketSeries('week', 12, now, TZ)
    const rows: ViewerBucket[] = [
      { bucket_start: series[0].toISOString(), viewers: 40, views: 90 },
      { bucket_start: series[11].toISOString(), viewers: 44, views: 95 },
    ]

    expect(fillBuckets(rows, 'week', 12, now, TZ)).toHaveLength(12)
  })

  it('attaches the correct label to each bucket', () => {
    const filled = fillBuckets([], 'quarter', 4, now, TZ)
    expect(filled.map((b) => b.label)).toEqual([
      'October 2025',
      'January 2026',
      'April 2026',
      'July 2026',
    ])
  })

  it('ignores rows outside the window and rows with an unparseable timestamp', () => {
    const rows: ViewerBucket[] = [
      { bucket_start: '2019-01-01T00:00:00.000Z', viewers: 999, views: 999 },
      { bucket_start: 'not-a-date', viewers: 888, views: 888 },
    ]

    const filled = fillBuckets(rows, 'month', 3, now, TZ)
    expect(filled).toHaveLength(3)
    expect(filled.every((b) => b.viewers === 0)).toBe(true)
  })
})

describe('normalizeActionCounts', () => {
  it('returns every action when the database returns a subset', () => {
    const rows: ActionCountRow[] = [
      { action: 'click', events: 12, distinct_jobs: 5, visitors: 4 },
    ]

    const counts = normalizeActionCounts(rows)

    expect(Object.keys(counts).sort()).toEqual([
      'apply',
      'apply_confirmed',
      'click',
      'dwell',
      'share',
      'view',
    ])
    expect(counts.click).toEqual({ events: 12, distinct_jobs: 5, visitors: 4 })
    expect(counts.apply).toEqual({ events: 0, distinct_jobs: 0, visitors: 0 })
    expect(counts.apply_confirmed).toEqual({ events: 0, distinct_jobs: 0, visitors: 0 })
    expect(counts.share).toEqual({ events: 0, distinct_jobs: 0, visitors: 0 })
    expect(counts.view).toEqual({ events: 0, distinct_jobs: 0, visitors: 0 })
  })

  it('keeps click, apply and share as independent counters', () => {
    const rows: ActionCountRow[] = [
      { action: 'view', events: 500, distinct_jobs: 60, visitors: 120 },
      { action: 'click', events: 300, distinct_jobs: 55, visitors: 100 },
      { action: 'apply', events: 40, distinct_jobs: 22, visitors: 35 },
      { action: 'share', events: 9, distinct_jobs: 7, visitors: 8 },
    ]

    const counts = normalizeActionCounts(rows)

    expect(counts.click.events).toBe(300)
    expect(counts.apply.events).toBe(40)
    expect(counts.share.events).toBe(9)
    // The three must never be merged or double-counted into one another.
    expect(counts.click.events + counts.apply.events + counts.share.events).toBe(349)
  })

  it('keeps apply clicks and confirmed applications separate', () => {
    // The whole point of the confirmation flow: leaving for the employer and
    // actually applying are different events, and confirmed is always a subset.
    const counts = normalizeActionCounts([
      { action: 'apply', events: 40, distinct_jobs: 22, visitors: 35 },
      { action: 'apply_confirmed', events: 11, distinct_jobs: 9, visitors: 10 },
    ])

    expect(counts.apply.events).toBe(40)
    expect(counts.apply_confirmed.events).toBe(11)
    expect(counts.apply_confirmed.events).toBeLessThan(counts.apply.events)
  })

  it('zero-fills confirmed applications when nobody has confirmed yet', () => {
    // A board with apply clicks but no confirmations must render 0, not a gap.
    const counts = normalizeActionCounts([
      { action: 'apply', events: 40, distinct_jobs: 22, visitors: 35 },
    ])

    expect(counts.apply_confirmed).toEqual({ events: 0, distinct_jobs: 0, visitors: 0 })
  })

  it('distinguishes event count from the number of distinct jobs', () => {
    // 30 apply clicks spread across 4 jobs: "jobs applied to" is 4, not 30.
    const counts = normalizeActionCounts([
      { action: 'apply', events: 30, distinct_jobs: 4, visitors: 11 },
    ])

    expect(counts.apply.events).toBe(30)
    expect(counts.apply.distinct_jobs).toBe(4)
  })

  it('coerces string counts, which is how Postgres BIGINT arrives over the wire', () => {
    const rows = [
      { action: 'share', events: '15', distinct_jobs: '3', visitors: '9' },
    ] as unknown as ActionCountRow[]

    expect(normalizeActionCounts(rows).share).toEqual({
      events: 15,
      distinct_jobs: 3,
      visitors: 9,
    })
  })

  it('drops unknown actions instead of throwing', () => {
    const rows = [
      { action: 'telepathy', events: 3, distinct_jobs: 1, visitors: 1 },
      { action: 'view', events: 2, distinct_jobs: 1, visitors: 1 },
    ] as unknown as ActionCountRow[]

    const counts = normalizeActionCounts(rows)
    expect(Object.keys(counts)).toHaveLength(EVENT_TYPES.length)
    expect(counts.view.events).toBe(2)
  })

  it('handles null and undefined input', () => {
    for (const input of [null, undefined, []]) {
      const counts = normalizeActionCounts(input as ActionCountRow[] | null | undefined)
      expect(counts.view.events).toBe(0)
      expect(counts.share.events).toBe(0)
    }
  })
})

describe('topInterests', () => {
  const rows: InterestRow[] = [
    { dimension: 'job_type', label: 'internship', events: 120, visitors: 40 },
    { dimension: 'job_type', label: 'graduate', events: 90, visitors: 33 },
    { dimension: 'job_type', label: 'part-time', events: 10, visitors: 6 },
    { dimension: 'tag', label: 'marketing', events: 200, visitors: 70 },
    { dimension: 'tag', label: 'analytics', events: 55, visitors: 21 },
  ]

  it('selects only the requested dimension', () => {
    expect(topInterests(rows, 'job_type', 10).map((r) => r.label)).toEqual([
      'internship',
      'graduate',
      'part-time',
    ])
    expect(topInterests(rows, 'tag', 10).map((r) => r.label)).toEqual(['marketing', 'analytics'])
  })

  it('sorts by event count descending', () => {
    const events = topInterests(rows, 'job_type', 10).map((r) => r.events)
    expect(events).toEqual([...events].sort((a, b) => b - a))
  })

  it('breaks ties on label so the order is stable between renders', () => {
    const tied: InterestRow[] = [
      { dimension: 'tag', label: 'zeta', events: 5, visitors: 1 },
      { dimension: 'tag', label: 'alpha', events: 5, visitors: 1 },
      { dimension: 'tag', label: 'mid', events: 5, visitors: 1 },
    ]
    expect(topInterests(tied, 'tag', 10).map((r) => r.label)).toEqual(['alpha', 'mid', 'zeta'])
  })

  it('folds the tail into Other and preserves the total', () => {
    const result = topInterests(rows, 'job_type', 2)

    expect(result.map((r) => r.label)).toEqual(['internship', 'graduate', 'Other'])
    expect(result[2].events).toBe(10)
    expect(result.reduce((sum, r) => sum + r.events, 0)).toBe(220)
  })

  it('does not add an Other row when everything already fits', () => {
    expect(topInterests(rows, 'job_type', 3).map((r) => r.label)).not.toContain('Other')
  })

  it('ignores rows with an empty label, which is how untagged jobs arrive', () => {
    const withBlank = [
      ...rows,
      { dimension: 'tag', label: '', events: 12, visitors: 4 },
    ] as InterestRow[]

    expect(topInterests(withBlank, 'tag', 10).map((r) => r.label)).toEqual([
      'marketing',
      'analytics',
    ])
  })

  it('handles null input and an empty dimension', () => {
    expect(topInterests(null, 'tag', 5)).toEqual([])
    expect(topInterests([], 'job_type', 5)).toEqual([])
  })

  it('clamps a zero limit to one real row plus Other', () => {
    const result = topInterests(rows, 'job_type', 0)
    expect(result.map((r) => r.label)).toEqual(['internship', 'Other'])
  })
})

describe('withVocabulary', () => {
  const slices = [
    { label: 'Analytics', events: 40, visitors: 20 },
    { label: 'Creative', events: 10, visitors: 5 },
  ]

  it('adds every untouched label as a zero row', () => {
    const all = withVocabulary(slices, ['Analytics', 'Creative', 'Events', 'Brand'])

    expect(all.map((slice) => slice.label)).toEqual([
      'Analytics',
      'Creative',
      'Brand',
      'Events',
    ])
    expect(all.find((slice) => slice.label === 'Brand')).toEqual({
      label: 'Brand',
      events: 0,
      visitors: 0,
    })
  })

  it('keeps labels the vocabulary has never heard of', () => {
    // Tag membership has only been enforced since 0018; history predating it
    // still carries what it carries, and dropping those rows would make the
    // table disagree with the totals above it.
    const all = withVocabulary(
      [...slices, { label: 'Supply Chain', events: 7, visitors: 3 }],
      ['Analytics', 'Creative']
    )

    expect(all.map((slice) => slice.label)).toContain('Supply Chain')
  })

  it('never lets an untouched label outrank one with interest', () => {
    const all = withVocabulary(slices, ['Zebra', 'Analytics'])

    expect(all[0].label).toBe('Analytics')
    expect(all[all.length - 1].label).toBe('Zebra')
  })
})

describe('evenlySpacedTicks', () => {
  const labels = (count: number) =>
    Array.from({ length: count }, (_, i) => String(i).padStart(2, '0'))

  it('labels everything when the window is short enough', () => {
    expect(evenlySpacedTicks(labels(7))).toEqual(labels(7))
  })

  it('holds one stride across the whole axis', () => {
    // The failure this exists to prevent: gaps of two weeks, then one, then
    // one, then two, which reads as uneven time rather than uneven labelling.
    const ticks = evenlySpacedTicks(labels(13))
    const positions = ticks.map((tick) => labels(13).indexOf(tick))
    const gaps = positions.slice(1).map((position, i) => position - positions[i])

    expect(new Set(gaps).size).toBe(1)
  })

  it('always labels the most recent bucket', () => {
    for (const count of [8, 13, 30, 90]) {
      const all = labels(count)
      expect(evenlySpacedTicks(all).at(-1)).toBe(all.at(-1))
    }
  })

  it('never returns more ticks than asked for', () => {
    for (const count of [8, 13, 30, 90]) {
      expect(evenlySpacedTicks(labels(count)).length).toBeLessThanOrEqual(7)
    }
  })

  it('spends the remainder at the left edge, not in the middle', () => {
    // 30 buckets at a stride of 5 leaves four unlabelled at the start; what
    // must never happen is one short gap somewhere inside the axis.
    const all = labels(30)
    const ticks = evenlySpacedTicks(all)

    expect(ticks).toEqual(['04', '09', '14', '19', '24', '29'])
  })
})

describe('fillActionSeries', () => {
  // Melbourne midnight for a September day, which is 14:00 UTC the day before
  // — the instants the SQL returns and `bucketSeries` generates.
  const at = (day: number) => `2026-09-${String(day - 1).padStart(2, '0')}T14:00:00.000Z`
  // 15:00 in Melbourne on the 5th, so a 3-bucket window covers the 3rd to 5th.
  const now = new Date('2026-09-05T05:00:00Z')

  it('reads every action out of one row per bucket', () => {
    const series = fillActionSeries(
      [
        { bucket_start: at(3), counts: { view: 5, click: 2 } },
        { bucket_start: at(4), counts: { view: 7, click: 3, share: 1 } },
      ],
      'day',
      3,
      now,
      TZ
    )

    expect(series.view).toEqual([5, 7, 0])
    expect(series.click).toEqual([2, 3, 0])
    expect(series.share).toEqual([0, 1, 0])
  })

  it('returns a full-length series for every known action, named or not', () => {
    const series = fillActionSeries([], 'day', 4, now, TZ)

    for (const type of EVENT_TYPES) {
      expect(series[type]).toEqual([0, 0, 0, 0])
    }
  })

  it('survives a null counts object', () => {
    const series = fillActionSeries(
      [{ bucket_start: at(5), counts: null }],
      'day',
      2,
      now,
      TZ
    )

    expect(series.view).toEqual([0, 0])
  })

  it('zero-fills a bucket the database never sent', () => {
    // This is the behaviour that hid a truncated response: a missing bucket
    // and an empty one are indistinguishable here by design, which is why the
    // tiles take their headline figures from the window totals instead.
    const series = fillActionSeries(
      [{ bucket_start: at(5), counts: { click: 9 } }],
      'day',
      3,
      now,
      TZ
    )

    expect(series.click).toEqual([0, 0, 9])
  })
})
