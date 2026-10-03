import { describe, it, expect } from 'vitest'
import { approveStaged, rejectStaged, bulkAction, isRejectReason, parseRejectComment, recheckPending } from './staged-actions'
import { fakeDb, type Handler, type Op } from './test-helpers/fake-db'

const NORMALISED = {
  title: 'Graduate Program',
  company: 'Unilever',
  location: 'Sydney',
  work_mode: null,
  job_type: 'graduate',
  url: 'https://x.test/job/R-1',
  description: '<p>ok</p><script>alert(1)</script>',
  tags: ['Brand'],
  posted_at: null,
  closing_at: '2026-12-01',
}

const CLAIMED = { id: 's1', external_id: 'R-1', fingerprint: 'fp', normalised: NORMALISED, sources: { slug: 'unilever', config: { domain: 'unilever.com' } } }

const has = (ops: Op[], name: string) => ops.some((o) => o.name === name)
const argOf = (ops: Op[], name: string) => ops.find((o) => o.name === name)!.args[0] as Record<string, unknown>

/** Scripts the happy path: claim succeeds, insert returns a job id. */
function happy(overrides: Partial<Record<'claim' | 'insert' | 'fp' | 'release', unknown>> = {}): Handler {
  return (table, ops) => {
    if (table === 'staged_jobs' && has(ops, 'update') && argOf(ops, 'update').status === 'approved')
      return (overrides.claim as never) ?? { data: CLAIMED }
    if (table === 'staged_jobs' && has(ops, 'update') && argOf(ops, 'update').status === 'pending')
      return (overrides.release as never) ?? {}
    if (table === 'jobs' && has(ops, 'insert')) return (overrides.insert as never) ?? { data: { id: 'job-1' } }
    if (table === 'job_fingerprints') return (overrides.fp as never) ?? {}
  }
}

describe('approveStaged', () => {
  it('claims only a still-pending row, recording who approved it', async () => {
    const { db, log } = fakeDb(happy())
    await approveStaged(db, 's1', 'admin-1')

    const claim = log[0]
    expect(claim.table).toBe('staged_jobs')
    expect(argOf(claim.ops, 'update')).toMatchObject({ status: 'approved', reviewed_by: 'admin-1' })
    expect(claim.ops).toContainEqual({ name: 'eq', args: ['status', 'pending'] })
  })

  it('claims BEFORE publishing: the job insert comes after the claim', async () => {
    const { db, log } = fakeDb(happy())
    await approveStaged(db, 's1', 'admin-1')
    expect(log.map((c) => c.table)).toEqual(['staged_jobs', 'company_logos', 'jobs', 'job_fingerprints'])
  })

  it('publishes as an active, non-sponsored sync:<slug> job, not auto-published', async () => {
    const { db, log } = fakeDb(happy())
    const result = await approveStaged(db, 's1', 'admin-1')

    expect(result).toEqual({ ok: true, jobId: 'job-1' })
    const job = argOf(log.find((c) => c.table === 'jobs')!.ops, 'insert')
    expect(job).toMatchObject({
      source: 'sync:unilever',
      external_id: 'R-1',
      title: 'Graduate Program',
      is_active: true,
      is_sponsored: false,
      auto_published_at: null,
    })
  })

  it('prefers an admin-approved company logo over the source domain', async () => {
    const approved = 'https://cdn.brandfetch.io/domain/unilever.com.au/w/128/h/128/fallback/lettermark/icon?c=x'
    const base = happy()
    const { db, log } = fakeDb((table, ops) => (table === 'company_logos' ? { data: { logo_url: approved } } : base(table, ops)))
    await approveStaged(db, 's1', 'admin-1')
    const job = argOf(log.find((c) => c.table === 'jobs')!.ops, 'insert')
    expect(job.company_logo_url).toBe(approved)
  })

  it('gives the job its logo from the source domain', async () => {
    const { db, log } = fakeDb(happy())
    await approveStaged(db, 's1', 'admin-1')
    const job = argOf(log.find((c) => c.table === 'jobs')!.ops, 'insert')
    expect(job.company_logo_url).toContain('cdn.brandfetch.io/domain/unilever.com/')
  })

  it('sanitises the description again before it goes public', async () => {
    const { db, log } = fakeDb(happy())
    await approveStaged(db, 's1', 'admin-1')
    const job = argOf(log.find((c) => c.table === 'jobs')!.ops, 'insert')
    expect(job.description).toContain('<p>ok</p>')
    expect(job.description).not.toContain('<script>')
  })

  it('repoints the fingerprint to the new job and clears the staged pointer', async () => {
    const { db, log } = fakeDb(happy())
    await approveStaged(db, 's1', 'admin-1')
    const fp = log.find((c) => c.table === 'job_fingerprints')!
    expect(argOf(fp.ops, 'update')).toEqual({ job_id: 'job-1', staged_job_id: null })
    expect(fp.ops).toContainEqual({ name: 'eq', args: ['fingerprint', 'fp'] })
  })

  it('returns conflict, and publishes nothing, when another admin got there first', async () => {
    const { db, log } = fakeDb(happy({ claim: { data: null } }))
    expect(await approveStaged(db, 's1', 'admin-1')).toEqual({ ok: false, kind: 'conflict' })
    expect(log.some((c) => c.table === 'jobs')).toBe(false)
  })

  it('releases the claim back to pending if the publish fails', async () => {
    const { db, log } = fakeDb(happy({ insert: { error: { message: 'duplicate key' } } }))
    const result = await approveStaged(db, 's1', 'admin-1')

    expect(result).toMatchObject({ ok: false, kind: 'error', stranded: false })
    const release = log.filter((c) => c.table === 'staged_jobs')[1]
    expect(argOf(release.ops, 'update')).toEqual({ status: 'pending', reviewed_by: null })
  })

  it('reports a stranded row when the release fails too', async () => {
    const { db } = fakeDb(happy({ insert: { error: { message: 'x' } }, release: { error: { message: 'y' } } }))
    expect(await approveStaged(db, 's1', 'admin-1')).toMatchObject({ ok: false, kind: 'error', stranded: true })
  })

  it('reports, without undoing, a publish whose fingerprint repoint failed', async () => {
    const { db } = fakeDb(happy({ fp: { error: { message: 'fp down' } } }))
    const result = await approveStaged(db, 's1', 'admin-1')
    expect(result).toMatchObject({ ok: false, kind: 'error' })
    expect((result as { message: string }).message).toMatch(/published, but fingerprint/)
  })

  it('sends no email -- a synced job has no submitter', async () => {
    const { db, log } = fakeDb(happy())
    await approveStaged(db, 's1', 'admin-1')
    expect(log.map((c) => c.table)).not.toContain('email')
  })
})

describe('rejectStaged', () => {
  it('claims a pending row with the reason and reviewer, and never touches the fingerprint', async () => {
    const { db, log } = fakeDb((table) => (table === 'staged_jobs' ? { data: { id: 's1' } } : undefined))
    expect(await rejectStaged(db, 's1', 'irrelevant', 'admin-1')).toEqual({ ok: true })

    expect(argOf(log[0].ops, 'update')).toMatchObject({ status: 'rejected', reject_reason: 'irrelevant', reviewed_by: 'admin-1' })
    expect(log[0].ops).toContainEqual({ name: 'eq', args: ['status', 'pending'] })
    expect(log.some((c) => c.table === 'job_fingerprints')).toBe(false)
  })

  it('returns conflict for an already-actioned row', async () => {
    const { db } = fakeDb(() => ({ data: null }))
    expect(await rejectStaged(db, 's1', 'duplicate', 'admin-1')).toEqual({ ok: false, kind: 'conflict' })
  })

  it('stores the admin comment, and null when there is none', async () => {
    const { db, log } = fakeDb(() => ({ data: { id: 's1' } }))
    await rejectStaged(db, 's1', 'too_senior', 'admin-1', 'Wants 3 years in agency')
    await rejectStaged(db, 's2', 'irrelevant', 'admin-1')
    expect(argOf(log[0].ops, 'update')).toMatchObject({ reject_reason: 'too_senior', reject_comment: 'Wants 3 years in agency' })
    expect(argOf(log[1].ops, 'update')).toMatchObject({ reject_comment: null })
  })
})

describe('parseRejectComment', () => {
  it('trims, treats empty as none, and refuses what the column would', () => {
    expect(parseRejectComment('  too senior  ')).toBe('too senior')
    expect(parseRejectComment('   ')).toBeNull()
    expect(parseRejectComment(undefined)).toBeNull()
    expect(parseRejectComment(null)).toBeNull()
    expect(parseRejectComment(42)).toBeUndefined()
    expect(parseRejectComment('x'.repeat(501))).toBeUndefined()
    expect(parseRejectComment('x'.repeat(500))).toHaveLength(500)
  })
})

describe('recheckPending', () => {
  const pending = [
    { id: 'keep', normalised: { ...NORMALISED, title: 'Marketing Graduate Program', description: '<p>No experience needed</p>' } },
    { id: 'senior', normalised: { ...NORMALISED, title: 'Assistant Brand Manager', job_type: null } },
    { id: 'exp', normalised: { ...NORMALISED, description: '<p>You bring 3+ years’ experience in brand.</p>' } },
  ]
  const queue: Handler = (table, ops) => {
    if (table === 'staged_jobs' && has(ops, 'select') && !has(ops, 'update')) return { data: pending }
    if (table === 'staged_jobs' && has(ops, 'update')) return { data: { id: 'x' } }
  }

  it('lists what the current filter would remove without touching anything', async () => {
    const { db, log } = fakeDb(queue)
    const removals = await recheckPending(db, 'admin-1', { apply: false })

    expect(removals).toMatchObject([
      { id: 'senior', reason: 'too_senior' },
      { id: 'exp', reason: 'experience_required', comment: 'Filter recheck: experience_required -- "3+ years’ experience"' },
    ])
    expect(log.some((c) => has(c.ops, 'update'))).toBe(false)
  })

  it('rejects them with the rule as the comment once applied', async () => {
    const { db, log } = fakeDb(queue)
    await recheckPending(db, 'admin-1', { apply: true })

    const updates = log.filter((c) => has(c.ops, 'update'))
    expect(updates).toHaveLength(2)
    expect(argOf(updates[0].ops, 'update')).toMatchObject({ status: 'rejected', reject_reason: 'too_senior', reviewed_by: 'admin-1' })
    expect(updates[0].ops).toContainEqual({ name: 'eq', args: ['status', 'pending'] })
  })

  it('reports a read failure instead of an empty list', async () => {
    const { db } = fakeDb(() => ({ error: { message: 'boom' } }))
    expect(await recheckPending(db, 'admin-1', { apply: false })).toEqual({ error: 'boom' })
  })
})

describe('bulkAction', () => {
  it('reports each row separately, so partial success is visible', async () => {
    let n = 0
    const { db } = fakeDb((table) => (table === 'staged_jobs' ? (n++ === 0 ? { data: { id: 'a' } } : { data: null }) : undefined))
    const outcomes = await bulkAction(db, ['a', 'b'], { type: 'reject', reason: 'irrelevant' }, 'admin-1')

    expect(outcomes).toEqual([
      { id: 'a', result: { ok: true } },
      { id: 'b', result: { ok: false, kind: 'conflict' } },
    ])
  })
})

describe('isRejectReason', () => {
  it('accepts exactly the reasons the staged_jobs CHECK constraint allows', () => {
    for (const r of ['irrelevant', 'too_senior', 'experience_required', 'duplicate', 'expired', 'employer_blocked', 'bad_link', 'other']) {
      expect(isRejectReason(r)).toBe(true)
    }
    expect(isRejectReason('spam')).toBe(false)
    expect(isRejectReason(undefined)).toBe(false)
  })
})
