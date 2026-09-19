import { describe, it, expect } from 'vitest'
import { audienceTiles, engagementTiles, funnelSteps } from './metrics'
import type { ActionSeries } from './metrics'
import type { DwellBucket } from '@/lib/types'
import type { FilledBucket } from './buckets'
import type { ActionCounts } from '@/lib/types'

const bucket = (day: number, viewers: number, views: number): FilledBucket => ({
  bucketStart: `2026-09-${String(day).padStart(2, '0')}T14:00:00.000Z`,
  label: `Sep ${day}`,
  viewers,
  views,
})

/** Four days of comparison window, then four days of reported window. */
const daily: FilledBucket[] = [
  bucket(1, 10, 20),
  bucket(2, 10, 20),
  bucket(3, 10, 20),
  bucket(4, 10, 20),
  bucket(5, 20, 50),
  bucket(6, 20, 50),
  bucket(7, 20, 50),
  bucket(8, 20, 50),
]

/** Four days of comparison window, then four days of reported window. */
const dwell: DwellBucket[] = [
  { bucket_start: '2026-09-01T14:00:00.000Z', avg_ms: 60_000, samples: 10 },
  { bucket_start: '2026-09-02T14:00:00.000Z', avg_ms: 60_000, samples: 10 },
  { bucket_start: '2026-09-03T14:00:00.000Z', avg_ms: 60_000, samples: 10 },
  { bucket_start: '2026-09-04T14:00:00.000Z', avg_ms: 60_000, samples: 10 },
  { bucket_start: '2026-09-05T14:00:00.000Z', avg_ms: 90_000, samples: 10 },
  { bucket_start: '2026-09-06T14:00:00.000Z', avg_ms: 90_000, samples: 10 },
  { bucket_start: '2026-09-07T14:00:00.000Z', avg_ms: 90_000, samples: 10 },
  { bucket_start: '2026-09-08T14:00:00.000Z', avg_ms: 90_000, samples: 10 },
]

const counts = (overrides: Partial<ActionCounts> = {}): ActionCounts => ({
  view: { events: 200, distinct_jobs: 6, visitors: 90 },
  click: { events: 50, distinct_jobs: 6, visitors: 40 },
  apply: { events: 20, distinct_jobs: 5, visitors: 18 },
  apply_confirmed: { events: 4, distinct_jobs: 3, visitors: 4 },
  share: { events: 8, distinct_jobs: 4, visitors: 8 },
  dwell: { events: 120, distinct_jobs: 6, visitors: 70 },
  ...overrides,
})

describe('audienceTiles', () => {
  it('sums only the reported half of the series', () => {
    const [, views] = audienceTiles({ daily, distinctViewers: 90, dwell, comparable: true })

    expect(views.value).toBe(200)
    expect(views.series).toEqual([50, 50, 50, 50])
  })

  it('compares against the earlier half of the same series', () => {
    const [, views] = audienceTiles({ daily, distinctViewers: 90, dwell, comparable: true })

    // 200 views against 80.
    expect(views.trend).toEqual({ changePct: 150, direction: 'up' })
  })

  it('never puts a percentage on unique visitors', () => {
    // A window's distinct viewers is not the sum of its daily distinct
    // viewers, so no previous value exists to compare against — and inventing
    // one would be the most quietly wrong number on the page.
    const [viewers] = audienceTiles({ daily, distinctViewers: 90, dwell, comparable: true })

    expect(viewers.value).toBe(90)
    expect(viewers.trend.changePct).toBeNull()
    expect(viewers.series).toEqual([])
  })

  it('reports time on page in seconds, weighted by how many people read', () => {
    const tiles = audienceTiles({ daily, distinctViewers: 90, dwell, comparable: true })
    const time = tiles.find((tile) => tile.key === 'time-on-page')

    // 90s across the reported half, against 60s before it.
    expect(time?.value).toBe(90)
    expect(time?.series).toEqual([90, 90, 90, 90])
    expect(time?.trend.changePct).toBe(50)
  })

  it('weights the window average by readers, not by days', () => {
    // One busy day at 100s and three quiet ones at 10s is not "an average of
    // 32 seconds" — almost everyone who read anything read for 100.
    const lopsided: DwellBucket[] = [
      { bucket_start: 'a', avg_ms: 10_000, samples: 1 },
      { bucket_start: 'b', avg_ms: 10_000, samples: 1 },
      { bucket_start: 'c', avg_ms: 100_000, samples: 100 },
      { bucket_start: 'd', avg_ms: 10_000, samples: 1 },
      { bucket_start: 'e', avg_ms: 10_000, samples: 1 },
      { bucket_start: 'f', avg_ms: 100_000, samples: 100 },
    ]

    const tiles = audienceTiles({
      daily,
      distinctViewers: 90,
      dwell: lopsided,
      comparable: true,
    })

    expect(tiles.find((tile) => tile.key === 'time-on-page')?.value).toBe(98)
  })

  it('falls back to views per visitor when time on page is unavailable', () => {
    // A database without migration 0022 keeps a fourth tile rather than a hole.
    const tiles = audienceTiles({ daily, distinctViewers: 90, dwell: null, comparable: true })
    const depth = tiles.find((tile) => tile.key === 'views-per-viewer')

    expect(depth?.value).toBe(2.5)
    expect(depth?.series).toEqual([2.5, 2.5, 2.5, 2.5])
    expect(depth?.trend.changePct).toBe(25)
  })

  it('claims no movement at all when history does not cover the comparison window', () => {
    const tiles = audienceTiles({ daily, distinctViewers: 90, dwell, comparable: false })

    expect(tiles.every((tile) => tile.trend.changePct === null)).toBe(true)
  })
})

describe('engagementTiles', () => {
  const series: ActionSeries = {
    view: [5, 5, 5, 5, 9, 9, 9, 9],
    click: [3, 3, 3, 3, 6, 6, 6, 6],
    apply: [1, 1, 1, 1, 2, 2, 2, 2],
    apply_confirmed: [0, 0, 0, 0, 1, 1, 1, 1],
    share: [2, 2, 2, 2, 2, 2, 2, 2],
    dwell: [4, 4, 4, 4, 7, 7, 7, 7],
  }

  it('takes each figure from the window total, and its shape from the series', () => {
    // Deliberately not sum(series): the funnel reads the same totals, and a
    // tile that derives its own figure can disagree with the block underneath
    // it — which is exactly what a truncated series did on the live board.
    const tiles = engagementTiles(series, counts(), true)
    const clicks = tiles.find((tile) => tile.key === 'click')

    expect(clicks?.value).toBe(50)
    expect(clicks?.series).toEqual([6, 6, 6, 6])
    expect(clicks?.trend).toEqual({ changePct: 100, direction: 'up' })
  })

  it('agrees with the funnel about every step it shares with it', () => {
    const tiles = engagementTiles(series, counts(), true)
    const steps = funnelSteps(counts())

    const byLabel = new Map(steps.map((step) => [step.key, step.value]))
    expect(tiles.find((tile) => tile.key === 'click')?.value).toBe(byLabel.get('click'))
    expect(tiles.find((tile) => tile.key === 'apply')?.value).toBe(byLabel.get('apply'))
  })

  it('falls back to the window totals when the per-action series is unavailable', () => {
    // A database that has not run migration 0021 still renders the page, with
    // figures and without shapes.
    const tiles = engagementTiles(null, counts(), true)
    const clicks = tiles.find((tile) => tile.key === 'click')

    expect(clicks?.value).toBe(50)
    expect(clicks?.series).toEqual([])
    expect(clicks?.trend.changePct).toBeNull()
  })

  it('reports apply rate rather than self-reported applications', () => {
    const tiles = engagementTiles(series, counts(), true)

    // Nothing on this row may depend on a visitor coming back to tell us.
    expect(tiles.some((tile) => tile.key === 'apply_confirmed')).toBe(false)

    const rate = tiles.find((tile) => tile.key === 'apply-rate')
    // The window totals: 20 applies against 50 clicks, the same pair the
    // funnel divides.
    expect(rate?.value).toBe(40)
    expect(rate?.format).toBe('percent')
  })

  it('states the apply rate as a rate day by day, not as a count', () => {
    const rate = engagementTiles(series, counts(), true).find(
      (tile) => tile.key === 'apply-rate'
    )

    // 2 applies of 6 clicks, every day of the reported half.
    expect(rate?.series.map(Math.round)).toEqual([33, 33, 33, 33])
  })
})

describe('funnelSteps', () => {
  it('states each step as a share of the first one', () => {
    const steps = funnelSteps(counts())

    expect(steps.map((step) => step.value)).toEqual([200, 50, 20, 4])
    expect(steps.map((step) => step.shareOfTop)).toEqual([1, 0.25, 0.1, 0.02])
  })

  it('keeps the steps in funnel order, each a subset of the one above', () => {
    const values = funnelSteps(counts()).map((step) => step.value)

    expect(values).toEqual([...values].sort((a, b) => b - a))
  })

  it('does not divide by an empty window', () => {
    const empty = counts({
      view: { events: 0, distinct_jobs: 0, visitors: 0 },
      click: { events: 0, distinct_jobs: 0, visitors: 0 },
      apply: { events: 0, distinct_jobs: 0, visitors: 0 },
      apply_confirmed: { events: 0, distinct_jobs: 0, visitors: 0 },
      share: { events: 0, distinct_jobs: 0, visitors: 0 },
      dwell: { events: 0, distinct_jobs: 0, visitors: 0 },
    })

    expect(funnelSteps(empty).every((step) => step.shareOfTop === 0)).toBe(true)
  })
})
