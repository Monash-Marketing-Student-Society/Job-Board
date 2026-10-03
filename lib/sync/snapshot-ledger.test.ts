import { describe, it, expect } from 'vitest'
import { monthStart, monthlyUsage, snapshotLedger } from './snapshot-ledger'
import { fakeDb } from './test-helpers/fake-db'

describe('monthlyUsage', () => {
  it('counts delivered records, and the worst case for anything not delivered', () => {
    expect(
      monthlyUsage([
        { status: 'collected', records: 120, max_records: 432 },
        { status: 'triggered', records: null, max_records: 432 },
        { status: 'failed', records: null, max_records: 50 },
      ])
    ).toBe(120 + 432 + 50)
  })

  it('is zero for a month with no snapshots', () => {
    expect(monthlyUsage([])).toBe(0)
  })
})

describe('monthStart', () => {
  it('is midnight UTC on the 1st', () => {
    expect(monthStart(new Date('2026-10-03T07:00:00Z')).toISOString()).toBe('2026-10-01T00:00:00.000Z')
  })
})

describe('snapshotLedger', () => {
  it('reads only this source and this month', async () => {
    const { db, log } = fakeDb(() => ({ data: [{ status: 'collected', records: 40, max_records: 432 }] }))
    expect(await snapshotLedger(db, 'src-li').recordsThisMonth()).toBe(40)
    const ops = log[0].ops.map((o) => [o.name, o.args[0]])
    expect(log[0].table).toBe('brightdata_snapshots')
    expect(ops).toContainEqual(['eq', 'source_id'])
    expect(ops).toContainEqual(['gte', 'triggered_at'])
  })

  it('returns recent posting ids newest first, capped at the limit', async () => {
    const { db } = fakeDb(() => ({ data: [{ posting_ids: ['3', '2'] }, { posting_ids: ['2', '1'] }] }))
    expect(await snapshotLedger(db, 'src-li').recentPostingIds(10)).toEqual(['3', '2', '1'])
    expect(await snapshotLedger(db, 'src-li').recentPostingIds(2)).toEqual(['3', '2'])
  })

  it('throws on a database error rather than reading it as zero spend', async () => {
    const { db } = fakeDb(() => ({ error: { message: 'down' } }))
    await expect(snapshotLedger(db, 'src-li').recordsThisMonth()).rejects.toThrow(/down/)
  })
})
