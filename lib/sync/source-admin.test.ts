import { describe, it, expect } from 'vitest'
import {
  countPublishedBySlug,
  publishMode,
  rejectRate,
  runHealth,
  sourcePatchSchema,
  tallyReviews,
  updateSource,
  type RunRow,
} from './source-admin'
import { fakeDb, type Handler, type Op } from './test-helpers/fake-db'

const has = (ops: Op[], name: string) => ops.some((o) => o.name === name)
const argOf = (ops: Op[], name: string) => ops.find((o) => o.name === name)!.args[0] as Record<string, unknown>
const eqs = (ops: Op[]) => ops.filter((o) => o.name === 'eq').map((o) => o.args)

const READ_AT = '2026-09-24T07:51:08.631638+00:00'
const CURRENT = { config: { vendor: 'workday' }, updated_at: READ_AT }
const UPDATED = { id: 'src-1', slug: 'unilever', name: 'Unilever', tier: 'A', config: {}, enabled: true }

function script(overrides: { read?: unknown; write?: unknown } = {}): Handler {
  return (table, ops) => {
    if (table !== 'sources') return
    if (has(ops, 'update')) return (overrides.write as never) ?? { data: [UPDATED] }
    return (overrides.read as never) ?? { data: CURRENT }
  }
}

describe('sourcePatchSchema', () => {
  it('accepts the three controls the page has', () => {
    expect(sourcePatchSchema.safeParse({ enabled: false }).success).toBe(true)
    expect(sourcePatchSchema.safeParse({ tier: 'B' }).success).toBe(true)
    expect(sourcePatchSchema.safeParse({ auto_publish: true }).success).toBe(true)
  })

  it('refuses frequency and raw config, which would stop or break a source', () => {
    expect(sourcePatchSchema.safeParse({ frequency: 'six_hourly' }).success).toBe(false)
    expect(sourcePatchSchema.safeParse({ config: { vendor: 'x' } }).success).toBe(false)
  })

  it('refuses an empty patch and a bad tier', () => {
    expect(sourcePatchSchema.safeParse({}).success).toBe(false)
    expect(sourcePatchSchema.safeParse({ tier: 'D' }).success).toBe(false)
    expect(sourcePatchSchema.safeParse({ enabled: 'false' }).success).toBe(false)
  })
})

describe('updateSource', () => {
  it('merges auto_publish into config, keeping vendor', async () => {
    const { db, log } = fakeDb(script())
    const result = await updateSource(db, 'src-1', { auto_publish: true })

    expect(result.ok).toBe(true)
    const write = log.find((c) => has(c.ops, 'update'))!
    expect(argOf(write.ops, 'update').config).toEqual({ vendor: 'workday', auto_publish: true })
  })

  it('leaves config alone when only pausing or demoting', async () => {
    const { db, log } = fakeDb(script())
    await updateSource(db, 'src-1', { enabled: false, tier: 'B' })

    const update = argOf(log.find((c) => has(c.ops, 'update'))!.ops, 'update')
    expect(update).toMatchObject({ enabled: false, tier: 'B' })
    expect(update).not.toHaveProperty('config')
    expect(update.updated_at).toEqual(expect.any(String))
  })

  it('guards the write on the updated_at it read', async () => {
    const { db, log } = fakeDb(script())
    await updateSource(db, 'src-1', { enabled: false })

    const write = log.find((c) => has(c.ops, 'update'))!
    expect(eqs(write.ops)).toEqual([
      ['id', 'src-1'],
      ['updated_at', READ_AT],
    ])
  })

  it('reports a conflict when the guarded write matched nothing', async () => {
    const { db } = fakeDb(script({ write: { data: [] } }))
    expect(await updateSource(db, 'src-1', { auto_publish: true })).toEqual({ ok: false, kind: 'conflict' })
  })

  it('reports not_found without writing', async () => {
    const { db, log } = fakeDb(script({ read: { data: null } }))
    expect(await updateSource(db, 'nope', { enabled: false })).toEqual({ ok: false, kind: 'not_found' })
    expect(log.some((c) => has(c.ops, 'update'))).toBe(false)
  })

  it('surfaces a database error', async () => {
    const { db } = fakeDb(script({ write: { error: { message: 'boom' } } }))
    expect(await updateSource(db, 'src-1', { tier: 'B' })).toEqual({ ok: false, kind: 'error', message: 'boom' })
  })
})

const NOW = new Date('2026-09-30T12:00:00Z')
const run = (over: Partial<RunRow> = {}): RunRow => ({
  started_at: '2026-09-29T16:02:13Z',
  finished_at: '2026-09-29T16:02:37Z',
  seen: 17,
  created: 0,
  deduped: 0,
  rejected: 16,
  held: 1,
  error: null,
  zero_guard_tripped: false,
  ...over,
})
const nightly = { enabled: true, frequency: 'nightly' }

describe('runHealth', () => {
  it('is ok for last night', () => {
    expect(runHealth(run(), nightly, NOW)).toEqual({ state: 'ok' })
  })

  it('never, failed and low, in that precedence', () => {
    expect(runHealth(null, nightly, NOW)).toEqual({ state: 'never' })
    expect(runHealth(run({ error: '500', zero_guard_tripped: true }), nightly, NOW)).toEqual({ state: 'failed', error: '500' })
    expect(runHealth(run({ zero_guard_tripped: true }), nightly, NOW)).toEqual({ state: 'low' })
  })

  it('flags a nightly source whose schedule stopped firing', () => {
    const old = run({ started_at: '2026-09-28T16:00:00Z' }) // 44h before NOW
    expect(runHealth(old, nightly, NOW)).toEqual({ state: 'stale' })
  })

  it('does not call a paused source stale', () => {
    const old = run({ started_at: '2026-09-20T16:00:00Z' })
    expect(runHealth(old, { enabled: false, frequency: 'nightly' }, NOW)).toEqual({ state: 'ok' })
  })
})

describe('publishMode', () => {
  const on = { enabled: true, tier: 'A' as const, config: { vendor: 'workday', auto_publish: true } }

  it('is review-only until auto_publish is exactly true', () => {
    expect(publishMode({ ...on, config: { vendor: 'workday' } }, 50)).toEqual({ mode: 'review_only' })
    expect(publishMode({ ...on, config: { auto_publish: 'true' } }, 50)).toEqual({ mode: 'review_only' })
  })

  it('paused wins over everything', () => {
    expect(publishMode({ ...on, enabled: false }, 50)).toEqual({ mode: 'paused' })
  })

  it('a demoted source is still held, whatever the switch says', () => {
    expect(publishMode({ ...on, tier: 'B' }, 50)).toEqual({ mode: 'held_by_tier' })
  })

  it('holds the first ten jobs from a source', () => {
    expect(publishMode(on, 1)).toEqual({ mode: 'warming_up', published: 1, needed: 10 })
    expect(publishMode(on, 10)).toEqual({ mode: 'auto' })
  })
})

describe('review tallies', () => {
  it('counts per source and computes the reject rate over decided rows', () => {
    const t = tallyReviews([
      { source_id: 'a', status: 'pending' },
      { source_id: 'a', status: 'approved' },
      { source_id: 'a', status: 'approved' },
      { source_id: 'a', status: 'approved' },
      { source_id: 'a', status: 'rejected' },
      { source_id: 'b', status: 'pending' },
    ])
    expect(t.get('a')).toEqual({ pending: 1, approved: 3, rejected: 1 })
    expect(rejectRate(t.get('a')!)).toBe(0.25)
    expect(rejectRate(t.get('b')!)).toBeNull()
  })

  it('counts published jobs per slug, ignoring human rows', () => {
    const m = countPublishedBySlug([{ source: 'sync:unilever' }, { source: 'sync:unilever' }, { source: 'manual' }])
    expect(m.get('unilever')).toBe(2)
    expect(m.size).toBe(1)
  })
})
