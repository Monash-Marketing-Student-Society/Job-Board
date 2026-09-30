import { describe, it, expect } from 'vitest'
import { autoPublishedSince, sourceNameFor, unpublishJob } from './auto-published'
import { fakeDb, type Op } from './test-helpers/fake-db'

const argsOf = (ops: Op[], name: string) => ops.filter((o) => o.name === name).map((o) => o.args)

describe('unpublishJob', () => {
  it('claims only a live synced job and sets nothing but is_active', async () => {
    const { db, log } = fakeDb(() => ({ data: [{ id: 'job-1' }] }))
    const result = await unpublishJob(db, 'job-1')

    expect(result).toEqual({ ok: true, jobId: 'job-1' })
    expect(log).toHaveLength(1)
    const { table, ops } = log[0]
    expect(table).toBe('jobs')
    expect(argsOf(ops, 'update')).toEqual([[{ is_active: false }]])
    expect(argsOf(ops, 'eq')).toEqual([
      ['id', 'job-1'],
      ['is_active', true],
    ])
    expect(argsOf(ops, 'like')).toEqual([['source', 'sync:%']])
  })

  it('never deletes the row, so dedup keeps the posting off the board', async () => {
    const { db, log } = fakeDb(() => ({ data: [{ id: 'job-1' }] }))
    await unpublishJob(db, 'job-1')
    expect(log.flatMap((c) => c.ops).some((o) => o.name === 'delete')).toBe(false)
  })

  it('is a conflict when nothing matched: already off, missing, or a human row', async () => {
    const { db } = fakeDb(() => ({ data: [] }))
    expect(await unpublishJob(db, 'job-1')).toEqual({ ok: false, kind: 'conflict' })
  })

  it('surfaces a database error', async () => {
    const { db } = fakeDb(() => ({ error: { message: 'boom' } }))
    expect(await unpublishJob(db, 'job-1')).toEqual({ ok: false, kind: 'error', message: 'boom' })
  })
})

describe('helpers', () => {
  it('looks back exactly seven days', () => {
    expect(autoPublishedSince(new Date('2026-10-08T00:00:00Z'))).toBe('2026-10-01T00:00:00.000Z')
  })

  it('names a job by its source, falling back to the slug', () => {
    const names = new Map([['unilever', 'Unilever']])
    expect(sourceNameFor('sync:unilever', names)).toBe('Unilever')
    expect(sourceNameFor('sync:telstra', names)).toBe('telstra')
  })
})
