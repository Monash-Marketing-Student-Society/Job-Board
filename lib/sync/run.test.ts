import { describe, it, expect, vi } from 'vitest'
import {
  processPosting,
  processSource,
  emptyCounts,
  zeroGuardTripped,
  rollingMedian,
  type SyncDeps,
  type StoredMatch,
} from './run'
import type { NormaliseResult, NormalisedJob } from './normalise'
import type { RawPosting, SourceRow, Adapter } from './adapters/types'

const SOURCE: SourceRow = {
  id: 'src-1',
  slug: 'unilever',
  name: 'Unilever',
  tier: 'A',
  adapter: 'ats',
  endpoint: 'https://example.test',
  config: {},
}

const JOB: NormalisedJob = {
  title: '2027 Graduate Program — Brand',
  company: 'Unilever',
  location: 'Melbourne',
  work_mode: null,
  job_type: 'graduate',
  url: 'https://unilever.wd3.myworkdayjobs.com/Unilever_Early_Careers/job/Melbourne/Grad_R-1188260',
  description: '<p>Role</p>',
  tags: ['Brand'],
  posted_at: null,
  closing_at: '2026-12-01',
}

const POSTING: RawPosting = {
  sourceJobId: 'R-1188260',
  applyUrl: JOB.url,
  title: JOB.title,
  company: 'Unilever',
  raw: { some: 'payload' },
  read: new Set(['title']),
}

const CLEAN: NormaliseResult = {
  job: JOB,
  confidence: { closing_at: 'read', location: 'read', job_type: 'read' },
}

function fakeDeps(overrides: Partial<SyncDeps> = {}): SyncDeps {
  return {
    findExisting: vi.fn().mockResolvedValue(null),
    countPublished: vi.fn().mockResolvedValue(50),
    stage: vi.fn().mockResolvedValue(undefined),
    publish: vi.fn().mockResolvedValue(undefined),
    enrich: vi.fn().mockResolvedValue(undefined),
    touch: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

const AUTO_SOURCE: SourceRow = { ...SOURCE, config: { auto_publish: true } }

describe('processPosting — routing', () => {
  it('stages a clean posting while the source is review-only (the default)', async () => {
    const deps = fakeDeps()
    const counts = emptyCounts()
    await processPosting(POSTING, CLEAN, SOURCE, deps, counts)

    expect(deps.stage).toHaveBeenCalledOnce()
    expect(deps.publish).not.toHaveBeenCalled()
    expect(counts.held).toBe(1)
    const staged = vi.mocked(deps.stage).mock.calls[0][0]
    expect(staged.riskReasons).toEqual(['review_only_mode'])
    expect(staged.sourceId).toBe('src-1')
    expect(staged.externalId).toBe('R-1188260')
  })

  it('publishes a clean posting once the source has been flipped to auto-publish', async () => {
    const deps = fakeDeps()
    const counts = emptyCounts()
    await processPosting(POSTING, CLEAN, AUTO_SOURCE, deps, counts)

    expect(deps.publish).toHaveBeenCalledOnce()
    expect(deps.stage).not.toHaveBeenCalled()
    expect(counts.created).toBe(1)
  })

  it('still holds a risky posting on an auto-publish source', async () => {
    const deps = fakeDeps()
    const counts = emptyCounts()
    const noClosing: NormaliseResult = { ...CLEAN, job: { ...JOB, closing_at: null } }
    await processPosting(POSTING, noClosing, AUTO_SOURCE, deps, counts)

    expect(deps.publish).not.toHaveBeenCalled()
    expect(counts.held).toBe(1)
    expect(vi.mocked(deps.stage).mock.calls[0][0].riskReasons).toContain('missing_closing_date')
  })

  it('holds the first jobs from a new adapter even on an auto-publish source', async () => {
    const deps = fakeDeps({ countPublished: vi.fn().mockResolvedValue(2) })
    const counts = emptyCounts()
    await processPosting(POSTING, CLEAN, AUTO_SOURCE, deps, counts)
    expect(vi.mocked(deps.stage).mock.calls[0][0].riskReasons).toContain('new_adapter')
  })
})

describe('processPosting — targeting', () => {
  it('rejects an off-target posting before fingerprinting or any database call', async () => {
    const deps = fakeDeps()
    const counts = emptyCounts()
    const perth: NormaliseResult = { ...CLEAN, job: { ...JOB, location: 'Perth' } }
    await processPosting(POSTING, perth, SOURCE, deps, counts)

    expect(counts.rejected).toBe(1)
    expect(deps.findExisting).not.toHaveBeenCalled()
    expect(deps.stage).not.toHaveBeenCalled()
  })

  it('holds an unsure posting for review with classifier_unsure, never publishing it', async () => {
    const deps = fakeDeps()
    const counts = emptyCounts()
    const unknownCity: NormaliseResult = { ...CLEAN, job: { ...JOB, location: 'Remote - Australia' } }
    await processPosting(POSTING, unknownCity, AUTO_SOURCE, deps, counts)

    expect(deps.publish).not.toHaveBeenCalled()
    expect(vi.mocked(deps.stage).mock.calls[0][0].riskReasons).toContain('classifier_unsure')
  })
})

describe('processPosting — dedup', () => {
  const syncedTierB: StoredMatch = { kind: 'job', id: 'j1', source: 'sync:adzuna', tier: 'B' }
  const human: StoredMatch = { kind: 'job', id: 'j2', source: 'submission', tier: null }
  const syncedTierA: StoredMatch = { kind: 'job', id: 'j3', source: 'sync:other', tier: 'A' }

  it('looks up all three identity keys, with the source in sync:<slug> form', async () => {
    const deps = fakeDeps()
    await processPosting(POSTING, CLEAN, SOURCE, deps, emptyCounts())
    const keys = vi.mocked(deps.findExisting).mock.calls[0][0]
    expect(keys.source).toBe('sync:unilever')
    expect(keys.externalId).toBe('R-1188260')
    expect(keys.applyUrlHash).toMatch(/^[0-9a-f]{64}$/)
    expect(keys.fingerprint).toMatch(/^[0-9a-f]{64}$/)
  })

  it('enriches a stored row of lower rank, and creates nothing new', async () => {
    const deps = fakeDeps({ findExisting: vi.fn().mockResolvedValue(syncedTierB) })
    const counts = emptyCounts()
    await processPosting(POSTING, CLEAN, SOURCE, deps, counts)

    expect(deps.enrich).toHaveBeenCalledWith(syncedTierB, JOB)
    expect(deps.stage).not.toHaveBeenCalled()
    expect(deps.publish).not.toHaveBeenCalled()
    expect(counts.deduped).toBe(1)
  })

  it('never enriches a human row -- discards and touches it instead', async () => {
    const deps = fakeDeps({ findExisting: vi.fn().mockResolvedValue(human) })
    await processPosting(POSTING, CLEAN, SOURCE, deps, emptyCounts())

    expect(deps.enrich).not.toHaveBeenCalled()
    expect(deps.touch).toHaveBeenCalledWith(human)
  })

  it('discards a re-sighting at equal rank', async () => {
    const deps = fakeDeps({ findExisting: vi.fn().mockResolvedValue(syncedTierA) })
    await processPosting(POSTING, CLEAN, SOURCE, deps, emptyCounts())

    expect(deps.enrich).not.toHaveBeenCalled()
    expect(deps.touch).toHaveBeenCalledWith(syncedTierA)
  })
})

describe('processSource', () => {
  const adapterOf = (postings: RawPosting[]): Adapter => ({
    kind: 'ats',
    fetch: vi.fn().mockResolvedValue(postings),
  })

  it('counts everything it saw and totals the outcomes', async () => {
    const offTarget: NormaliseResult = { ...CLEAN, job: { ...JOB, location: 'Perth' } }
    const results = [CLEAN, offTarget]
    let i = 0
    const counts = await processSource(SOURCE, adapterOf([POSTING, { ...POSTING, sourceJobId: 'R-2' }]), () => results[i++], fakeDeps())

    expect(counts.seen).toBe(2)
    expect(counts.held).toBe(1)
    expect(counts.rejected).toBe(1)
    expect(counts.errors).toBe(0)
  })

  it('isolates one bad posting: it counts an error and the rest still run', async () => {
    let i = 0
    const counts = await processSource(
      SOURCE,
      adapterOf([POSTING, { ...POSTING, sourceJobId: 'R-2' }]),
      () => {
        if (i++ === 0) throw new Error('malformed posting')
        return CLEAN
      },
      fakeDeps()
    )

    expect(counts.errors).toBe(1)
    expect(counts.held).toBe(1)
  })

  it('counts a database failure on one posting as an error, not a crash', async () => {
    const deps = fakeDeps({ stage: vi.fn().mockRejectedValue(new Error('db down')) })
    const counts = await processSource(SOURCE, adapterOf([POSTING]), () => CLEAN, deps)
    expect(counts.errors).toBe(1)
  })

  it('lets an adapter transport failure throw out, so the run records it', async () => {
    const adapter: Adapter = { kind: 'ats', fetch: vi.fn().mockRejectedValue(new Error('list failed')) }
    await expect(processSource(SOURCE, adapter, () => CLEAN, fakeDeps())).rejects.toThrow('list failed')
  })
})

describe('zeroGuardTripped', () => {
  it('trips on zero results, whatever the usual count', () => {
    expect(zeroGuardTripped(0, null)).toBe(true)
    expect(zeroGuardTripped(0, 12)).toBe(true)
  })

  it('trips when more than 50% below the usual count', () => {
    expect(zeroGuardTripped(4, 10)).toBe(true)
    expect(zeroGuardTripped(5, 10)).toBe(false) // exactly 50% is fine
    expect(zeroGuardTripped(9, 10)).toBe(false)
  })

  it('never trips on a positive count when no baseline exists yet', () => {
    expect(zeroGuardTripped(3, null)).toBe(false)
    expect(zeroGuardTripped(3, 0)).toBe(false)
  })
})

describe('rollingMedian', () => {
  it('is null with no history', () => {
    expect(rollingMedian([])).toBeNull()
  })

  it('takes the middle of an odd-length history, ignoring order', () => {
    expect(rollingMedian([9, 1, 5])).toBe(5)
  })

  it('averages the middle pair of an even-length history, rounded', () => {
    expect(rollingMedian([4, 6, 8, 10])).toBe(7)
    expect(rollingMedian([1, 2])).toBe(2) // 1.5 rounds up
  })

  it('drifts down through a quiet spell rather than sticking to old highs', () => {
    expect(rollingMedian([20, 20, 3, 2, 2])).toBe(3)
  })
})
