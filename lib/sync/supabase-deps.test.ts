import { describe, it, expect } from 'vitest'
import { supabaseDeps, dryRunDeps, recordSourceRun } from './supabase-deps'
import { emptyCounts, type StagedInsert } from './run'
import type { SourceRow } from './adapters/types'
import { fakeDb, callsTo, type Handler } from './test-helpers/fake-db'

const SOURCE: SourceRow = {
  id: 'src-1',
  slug: 'unilever',
  name: 'Unilever',
  tier: 'A',
  adapter: 'ats',
  endpoint: 'https://example.test',
  config: {},
}

const ROW: StagedInsert = {
  sourceId: 'src-1',
  externalId: 'R-1',
  raw: { a: 1 },
  normalised: {
    title: 'Grad',
    company: 'Unilever',
    location: 'Melbourne',
    work_mode: null,
    job_type: 'graduate',
    url: 'https://x.test/job/1',
    description: '<p>d</p>',
    tags: ['Brand'],
    posted_at: null,
    closing_at: '2026-12-01',
  },
  fingerprint: 'fp',
  applyUrlHash: 'uh',
  confidence: { title: 'read' },
  riskReasons: ['review_only_mode'],
}

const KEYS = { source: 'sync:unilever', externalId: 'R-1', applyUrlHash: 'uh', fingerprint: 'fp' }

const hasOp = (ops: { name: string; args: unknown[] }[], name: string, ...args: unknown[]) =>
  ops.some((o) => o.name === name && args.every((a, i) => o.args[i] === a))

describe('supabaseDeps.findExisting', () => {
  it('matches on source identity first, and resolves the tier of a synced row', async () => {
    const handler: Handler = (table, ops) => {
      if (table === 'jobs' && hasOp(ops, 'eq', 'external_id', 'R-1')) return { data: { id: 'j1', source: 'sync:unilever' } }
      if (table === 'sources') return { data: { tier: 'A' } }
    }
    const { db, log } = fakeDb(handler)
    const match = await supabaseDeps(db, SOURCE).findExisting(KEYS)

    expect(match).toEqual({ kind: 'job', id: 'j1', source: 'sync:unilever', tier: 'A' })
    expect(callsTo(log, 'job_fingerprints', 'select')).toHaveLength(0) // never reached the hash checks
  })

  it('reports a human row with no tier, without a sources lookup', async () => {
    const { db, log } = fakeDb((table) => (table === 'jobs' ? { data: { id: 'j2', source: 'submission' } } : undefined))
    const match = await supabaseDeps(db, SOURCE).findExisting(KEYS)

    expect(match).toEqual({ kind: 'job', id: 'j2', source: 'submission', tier: null })
    expect(log.some((c) => c.table === 'sources')).toBe(false)
  })

  it('falls through to the apply-URL hash, then the fingerprint', async () => {
    const seen: string[] = []
    const handler: Handler = (table, ops) => {
      if (table === 'job_fingerprints') {
        const col = ops.find((o) => o.name === 'eq')?.args[0] as string
        seen.push(col)
        if (col === 'fingerprint') return { data: { job_id: 'j3', staged_job_id: null } }
      }
      if (table === 'jobs' && hasOp(ops, 'eq', 'id', 'j3')) return { data: { id: 'j3', source: 'manual' } }
    }
    const { db } = fakeDb(handler)
    const match = await supabaseDeps(db, SOURCE).findExisting({ ...KEYS, externalId: null })

    expect(seen).toEqual(['apply_url_hash', 'fingerprint'])
    expect(match).toEqual({ kind: 'job', id: 'j3', source: 'manual', tier: null })
  })

  it('resolves a fingerprint that points at a staged job, with the tier of its source', async () => {
    const handler: Handler = (table) => {
      if (table === 'job_fingerprints') return { data: { job_id: null, staged_job_id: 's9' } }
      if (table === 'staged_jobs') return { data: { id: 's9', sources: { slug: 'adzuna', tier: 'B' } } }
    }
    const { db } = fakeDb(handler)
    const match = await supabaseDeps(db, SOURCE).findExisting({ ...KEYS, externalId: null })

    expect(match).toEqual({ kind: 'staged', id: 's9', source: 'sync:adzuna', tier: 'B' })
  })

  it('returns null when nothing matches', async () => {
    const { db } = fakeDb()
    expect(await supabaseDeps(db, SOURCE).findExisting(KEYS)).toBeNull()
  })
})

describe('supabaseDeps writes', () => {
  it('stage inserts the staged row, then a fingerprint pointing at it', async () => {
    const { db, log } = fakeDb((table) => (table === 'staged_jobs' ? { data: { id: 's1' } } : undefined))
    await supabaseDeps(db, SOURCE).stage(ROW)

    const staged = log.find((c) => c.table === 'staged_jobs')!
    expect(staged.ops.find((o) => o.name === 'insert')!.args[0]).toMatchObject({
      source_id: 'src-1',
      external_id: 'R-1',
      fingerprint: 'fp',
      risk_reasons: ['review_only_mode'],
    })
    const fp = log.find((c) => c.table === 'job_fingerprints')!
    expect(fp.ops.find((o) => o.name === 'insert')!.args[0]).toMatchObject({
      fingerprint: 'fp',
      staged_job_id: 's1',
      apply_url_hash: 'uh',
    })
  })

  it('stage throws when the staged insert fails, so the posting counts as an error', async () => {
    const { db } = fakeDb((table) => (table === 'staged_jobs' ? { error: { message: 'boom' } } : undefined))
    await expect(supabaseDeps(db, SOURCE).stage(ROW)).rejects.toThrow('stage: boom')
  })

  it('publish inserts an active job stamped auto_published_at under the sync: source', async () => {
    const { db, log } = fakeDb((table) => (table === 'jobs' ? { data: { id: 'j1' } } : undefined))
    await supabaseDeps(db, SOURCE).publish(ROW)

    const job = log.find((c) => c.table === 'jobs')!.ops.find((o) => o.name === 'insert')!.args[0] as Record<string, unknown>
    expect(job).toMatchObject({ source: 'sync:unilever', external_id: 'R-1', is_active: true, title: 'Grad' })
    expect(typeof job.auto_published_at).toBe('string')
    expect(log.find((c) => c.table === 'job_fingerprints')!.ops.find((o) => o.name === 'insert')!.args[0]).toMatchObject({
      job_id: 'j1',
    })
  })

  it('enrich on a job updates only url and description, and only where source LIKE sync:%', async () => {
    const { db, log } = fakeDb()
    await supabaseDeps(db, SOURCE).enrich({ kind: 'job', id: 'j1', source: 'sync:adzuna', tier: 'B' }, ROW.normalised)

    const call = log.find((c) => c.table === 'jobs')!
    const update = call.ops.find((o) => o.name === 'update')!.args[0]
    expect(update).toEqual({ url: ROW.normalised.url, description: ROW.normalised.description })
    expect(hasOp(call.ops, 'like', 'source', 'sync:%')).toBe(true)
    expect(hasOp(call.ops, 'eq', 'id', 'j1')).toBe(true)
  })

  it('touch bumps seen_count on the matching fingerprint', async () => {
    const handler: Handler = (table, ops) =>
      table === 'job_fingerprints' && ops.some((o) => o.name === 'select') ? { data: { fingerprint: 'fp', seen_count: 4 } } : undefined
    const { db, log } = fakeDb(handler)
    await supabaseDeps(db, SOURCE).touch({ kind: 'job', id: 'j1', source: 'sync:unilever', tier: 'A' })

    const update = log.flatMap((c) => c.ops).find((o) => o.name === 'update')!.args[0] as Record<string, unknown>
    expect(update.seen_count).toBe(5)
    expect(typeof update.last_seen_at).toBe('string')
  })
})

describe('dryRunDeps', () => {
  it('reads for real but writes nothing at all', async () => {
    const { db, log } = fakeDb((table) => (table === 'jobs' ? { data: { id: 'j1', source: 'manual' } } : undefined))
    const deps = dryRunDeps(supabaseDeps(db, SOURCE))

    expect(await deps.findExisting(KEYS)).not.toBeNull()
    const before = log.length
    await deps.stage(ROW)
    await deps.publish(ROW)
    await deps.enrich({ kind: 'job', id: 'j1', source: 'sync:x', tier: 'A' }, ROW.normalised)
    await deps.touch({ kind: 'job', id: 'j1', source: 'sync:x', tier: 'A' })
    expect(log.length).toBe(before)
  })
})

describe('recordSourceRun', () => {
  const counts = { ...emptyCounts(), seen: 12, held: 12 }
  const okResult = { counts, error: null, zeroGuardTripped: false }

  const handler: Handler = (table, ops) =>
    table === 'sync_runs' && ops.some((o) => o.name === 'select') ? { data: [{ seen: 10 }, { seen: 12 }, { seen: 14 }] } : undefined

  it('writes the run row with every count', async () => {
    const { db, log } = fakeDb(handler)
    await recordSourceRun(db, SOURCE, new Date('2026-09-24T00:00:00Z'), okResult)

    const inserted = log.find((c) => c.table === 'sync_runs')!.ops.find((o) => o.name === 'insert')!.args[0]
    expect(inserted).toMatchObject({ source_id: 'src-1', seen: 12, held: 12, error: null, zero_guard_tripped: false })
  })

  it('moves usual_count to the rolling median after a normal run', async () => {
    const { db, log } = fakeDb(handler)
    await recordSourceRun(db, SOURCE, new Date(), okResult)

    const update = callsTo(log, 'sources', 'update')[0].ops.find((o) => o.name === 'update')!.args[0] as Record<string, unknown>
    expect(update.usual_count).toBe(12)
    expect(typeof update.last_run_at).toBe('string')
  })

  it('leaves usual_count alone after a run that tripped the zero guard', async () => {
    const { db, log } = fakeDb(handler)
    await recordSourceRun(db, SOURCE, new Date(), { counts: emptyCounts(), error: null, zeroGuardTripped: true })

    const update = callsTo(log, 'sources', 'update')[0].ops.find((o) => o.name === 'update')!.args[0] as Record<string, unknown>
    expect('usual_count' in update).toBe(false)
  })

  it('leaves usual_count alone after an errored run, but still records the error', async () => {
    const { db, log } = fakeDb(handler)
    await recordSourceRun(db, SOURCE, new Date(), { counts: emptyCounts(), error: 'list failed', zeroGuardTripped: false })

    expect(log.find((c) => c.table === 'sync_runs')!.ops.find((o) => o.name === 'insert')!.args[0]).toMatchObject({
      error: 'list failed',
    })
    const update = callsTo(log, 'sources', 'update')[0].ops.find((o) => o.name === 'update')!.args[0] as Record<string, unknown>
    expect('usual_count' in update).toBe(false)
  })
})
