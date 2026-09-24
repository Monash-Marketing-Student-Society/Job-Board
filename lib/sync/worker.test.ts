import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import dns from 'dns/promises'
import { loadSources, runAllSources, runOneSource, type LoadedSource } from './worker'
import { fakeDb, callsTo, type Handler } from './test-helpers/fake-db'
import workdayList from './adapters/__fixtures__/workday-list.json'
import workdayDetail from './adapters/__fixtures__/workday-detail.json'

vi.mock('dns/promises', () => ({ default: { lookup: vi.fn() } }))

const WORKDAY: LoadedSource = {
  id: 'src-1',
  slug: 'unilever',
  name: 'Unilever',
  tier: 'A',
  adapter: 'ats',
  endpoint: 'https://unilever.wd3.myworkdayjobs.com/wday/cxs/unilever/Unilever_Early_Careers',
  config: { vendor: 'workday' },
  usual_count: null,
  frequency: 'nightly',
}

const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } })

// A Melbourne posting, so it survives the location gate and reaches staging.
const MELBOURNE_DETAIL = {
  jobPostingInfo: {
    ...workdayDetail.jobPostingInfo,
    title: '2027 Marketing Graduate Program',
    location: 'Melbourne, VIC',
  },
}

describe('loadSources', () => {
  it('loads enabled nightly sources, never the watcher adapter', async () => {
    const { db, log } = fakeDb(() => ({ data: [WORKDAY] }))
    await loadSources(db)
    const ops = log[0].ops
    expect(ops).toEqual(
      expect.arrayContaining([
        { name: 'eq', args: ['enabled', true] },
        { name: 'neq', args: ['adapter', 'watcher'] },
        { name: 'eq', args: ['frequency', 'nightly'] },
      ])
    )
  })

  it('loads one source by slug, whatever its frequency', async () => {
    const { db, log } = fakeDb(() => ({ data: [WORKDAY] }))
    await loadSources(db, 'unilever')
    expect(log[0].ops).toContainEqual({ name: 'eq', args: ['slug', 'unilever'] })
    expect(log[0].ops).not.toContainEqual({ name: 'eq', args: ['frequency', 'nightly'] })
  })
})

describe('runOneSource', () => {
  beforeEach(() => {
    vi.mocked(dns.lookup).mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never)
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        String(url).endsWith('/jobs') ? json({ total: 1, jobPostings: [workdayList.jobPostings[0]] }) : json(MELBOURNE_DETAIL)
      )
    )
  })
  afterEach(() => vi.unstubAllGlobals())

  const handler: Handler = (table) => (table === 'staged_jobs' ? { data: { id: 'st1' } } : undefined)

  it('runs a real Workday source end to end and stages its posting for review', async () => {
    const { db, log } = fakeDb(handler)
    const result = await runOneSource(db, WORKDAY, { dryRun: false })

    expect(result.error).toBeNull()
    expect(result.counts).toMatchObject({ seen: 1, held: 1, created: 0 })
    expect(callsTo(log, 'staged_jobs', 'insert')).toHaveLength(1)
    expect(callsTo(log, 'sync_runs', 'insert')).toHaveLength(1)
  })

  it('a dry run writes no rows at all -- no staging and no sync_runs', async () => {
    const { db, log } = fakeDb(handler)
    const result = await runOneSource(db, WORKDAY, { dryRun: true })

    expect(result.counts.held).toBe(1) // still decided, just not written
    expect(log.some((c) => c.ops.some((o) => ['insert', 'update'].includes(o.name)))).toBe(false)
  })

  it('records an unknown vendor as the run error instead of throwing', async () => {
    const { db, log } = fakeDb(handler)
    const result = await runOneSource(db, { ...WORKDAY, config: {} }, { dryRun: false })

    expect(result.error).toMatch(/no known vendor/)
    expect(log.find((c) => c.table === 'sync_runs')!.ops.find((o) => o.name === 'insert')!.args[0]).toMatchObject({
      error: expect.stringMatching(/no known vendor/),
    })
  })

  it('flags a run that returned nothing as a tripped zero guard', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ total: 0, jobPostings: [] })))
    const { db } = fakeDb(handler)
    const result = await runOneSource(db, WORKDAY, { dryRun: false })
    expect(result.zeroGuardTripped).toBe(true)
  })
})

describe('runAllSources', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('keeps going after one source fails', async () => {
    vi.mocked(dns.lookup).mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never)
    vi.stubGlobal('fetch', vi.fn(async () => json({ total: 0, jobPostings: [] })))

    const broken = { ...WORKDAY, id: 'src-0', slug: 'broken', config: {} }
    const { db } = fakeDb((table, ops) =>
      table === 'sources' && ops.some((o) => o.name === 'select') ? { data: [broken, WORKDAY] } : undefined
    )
    const summaries = await runAllSources(db, { dryRun: false })

    expect(summaries.map((s) => s.slug)).toEqual(['broken', 'unilever'])
    expect(summaries[0].error).toMatch(/no known vendor/)
    expect(summaries[1].error).toBeNull()
  })
})
