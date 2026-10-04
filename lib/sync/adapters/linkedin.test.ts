import { describe, it, expect, vi } from 'vitest'
import snapshot from './__fixtures__/linkedin-snapshot.json'
import {
  affordableLimit,
  createLinkedInAdapter,
  linkedInApplyUrl,
  SnapshotPendingError,
  toPostings,
  type LinkedInDeps,
  type LinkedInRecord,
} from './linkedin'
import { LIMIT_PER_INPUT, MONTHLY_RECORD_CAP, searchInputs } from './linkedin-config'
import type { AdapterContext, SnapshotLedger, SourceRow } from './types'
import { assessTarget } from '../target'
import { normaliseLinkedInPosting, type LinkedInRawPosting } from '../normalise'
import { emptyCounts, processSource, type StagedInsert, type SyncDeps } from '../run'

const RECORDS = snapshot as LinkedInRecord[]

const SOURCE: SourceRow = {
  id: 'src-li',
  slug: 'linkedin',
  name: 'LinkedIn',
  tier: 'C',
  adapter: 'aggregator',
  endpoint: 'https://api.brightdata.com/datasets/v3',
  config: { vendor: 'linkedin', consent: { type: 'explicit' } },
}

function fakeLedger(overrides: Partial<SnapshotLedger> = {}): SnapshotLedger {
  return {
    recordsThisMonth: vi.fn().mockResolvedValue(0),
    findResumable: vi.fn().mockResolvedValue(null),
    recentPostingIds: vi.fn().mockResolvedValue([]),
    triggered: vi.fn().mockResolvedValue(undefined),
    finished: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

function ctx(ledger: SnapshotLedger): AdapterContext {
  return { ledger, sleep: vi.fn().mockResolvedValue(undefined), dryRun: false }
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

/** A Bright Data stand-in: answers the trigger, then the scripted snapshot polls in order. */
function fakeApi(polls: Array<Response | Error>) {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, init })
    if (url.includes('/trigger?')) return json(200, { snapshot_id: 'sd_test' })
    const next = polls.shift()
    if (!next) throw new Error('unexpected poll')
    if (next instanceof Error) throw next
    return next
  })
  let clock = 0
  const deps: LinkedInDeps = { fetch: fetch as unknown as typeof globalThis.fetch, apiKey: () => 'test-key', now: () => (clock += 1000) }
  return { deps, calls, fetch }
}

describe('linkedin config', () => {
  it('searches 12 junior-phrased keywords x 2 cities = 24 inputs, all in Australia', () => {
    const inputs = searchInputs()
    expect(inputs).toHaveLength(24)
    // Both measured as useless live (3 Oct 2026): Bright Data ignores the one and errors on the other.
    expect(inputs.some((i) => 'job_type' in i || 'experience_level' in i)).toBe(false)
    expect(new Set(inputs.map((i) => i.location))).toEqual(new Set(['Melbourne', 'Sydney']))
    expect(inputs.every((i) => i.country === 'AU' && i.time_range === 'Past week' && !i.selective_search)).toBe(true)
  })

  it("stays under the cap at two runs a week, even if every input returns its full limit", () => {
    const worstMonth = searchInputs().length * LIMIT_PER_INPUT * (52 / 12) * 2
    expect(worstMonth).toBeLessThan(MONTHLY_RECORD_CAP)
  })
})

describe('affordableLimit', () => {
  it('uses the wanted limit when the month has room', () => {
    expect(affordableLimit(0, 4000, 24, 16)).toBe(16)
  })
  it('shrinks the per-input limit to what is left', () => {
    expect(affordableLimit(3800, 4000, 24, 16)).toBe(8) // 200 / 24
  })
  it('refuses when not even one record per input fits', () => {
    expect(affordableLimit(3980, 4000, 24, 16)).toBeNull()
    expect(affordableLimit(4100, 4000, 24, 16)).toBeNull()
  })
})

describe('toPostings', () => {
  const postings = toPostings(RECORDS)

  it('drops error records and postings LinkedIn has closed', () => {
    const ids = postings.map((p) => p.sourceJobId)
    expect(ids).not.toContain('4400000007') // application_availability: false
    expect(postings).toHaveLength(RECORDS.length - 2) // and the job_type-mismatch error record
  })

  it("prefers the employer's apply link, falling back to the LinkedIn job page", () => {
    expect(linkedInApplyUrl(RECORDS[1])).toBe('https://careers.examplefoods.com.au/jobs/123?utm_source=linkedin')
    expect(linkedInApplyUrl(RECORDS[0])).toMatch(/^https:\/\/www\.linkedin\.com\/jobs\/view\//)
    expect(linkedInApplyUrl({ url: 'javascript:alert(1)' })).toBeNull()
  })

  it("takes each posting's own company, not the source's name", () => {
    expect(postings[0].company).toBe('Delaware North, Australia & New Zealand')
  })
})

describe('linkedin adapter fetch', () => {
  it('triggers every input, polls until the snapshot is ready, and records the spend', async () => {
    const { deps, calls } = fakeApi([json(202, { status: 'running' }), json(200, RECORDS)])
    const ledger = fakeLedger({ recentPostingIds: vi.fn().mockResolvedValue(['111', '222']) })
    const c = ctx(ledger)

    const postings = await createLinkedInAdapter(deps).fetch(SOURCE, c)

    expect(postings).toHaveLength(RECORDS.length - 2)
    const trigger = calls[0]
    expect(trigger.url).toContain('dataset_id=gd_lpfll7v5hcqtkxl6l')
    expect(trigger.url).toContain(`limit_per_input=${LIMIT_PER_INPUT}`)
    const sent = JSON.parse(String(trigger.init?.body))
    expect(sent).toHaveLength(24)
    expect(sent[0].jobs_to_not_include).toEqual(['111', '222'])
    expect((trigger.init?.headers as Record<string, string>).Authorization).toBe('Bearer test-key')

    expect(ledger.triggered).toHaveBeenCalledWith(
      expect.objectContaining({ snapshotId: 'sd_test', maxRecords: 24 * LIMIT_PER_INPUT, dryRun: false })
    )
    // The logged inputs leave out the exclusion list.
    expect(vi.mocked(ledger.triggered).mock.calls[0][0].inputs[0]).not.toHaveProperty('jobs_to_not_include')
    expect(c.sleep).toHaveBeenCalledOnce()
    expect(ledger.finished).toHaveBeenCalledWith('sd_test', {
      status: 'collected',
      records: RECORDS.length,
      postingIds: expect.arrayContaining(['4471733100', '4400000007']),
    })
  })

  it('refuses to trigger once the month is spent', async () => {
    const { deps, fetch } = fakeApi([])
    const ledger = fakeLedger({ recordsThisMonth: vi.fn().mockResolvedValue(3990) })

    await expect(createLinkedInAdapter(deps).fetch(SOURCE, ctx(ledger))).rejects.toThrow(/monthly budget reached: 3990 of 4000/)
    expect(fetch).not.toHaveBeenCalled()
    expect(ledger.triggered).not.toHaveBeenCalled()
  })

  it('asks for fewer records per input when the month is nearly spent', async () => {
    const { deps, calls } = fakeApi([json(200, [])])
    const ledger = fakeLedger({ recordsThisMonth: vi.fn().mockResolvedValue(3800) })

    await createLinkedInAdapter(deps).fetch(SOURCE, ctx(ledger))

    expect(calls[0].url).toContain('limit_per_input=8')
    expect(ledger.triggered).toHaveBeenCalledWith(expect.objectContaining({ maxRecords: 24 * 8 }))
  })

  it('honours a lower monthly_cap set on the source row', async () => {
    const { deps, fetch } = fakeApi([])
    const ledger = fakeLedger({ recordsThisMonth: vi.fn().mockResolvedValue(500) })
    const source = { ...SOURCE, config: { ...SOURCE.config, monthly_cap: 510 } }

    await expect(createLinkedInAdapter(deps).fetch(source, ctx(ledger))).rejects.toThrow(/budget reached/)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('collects an uncollected snapshot instead of paying for a new one', async () => {
    const { deps, calls } = fakeApi([json(200, RECORDS)])
    const ledger = fakeLedger({ findResumable: vi.fn().mockResolvedValue({ snapshotId: 'sd_old' }) })

    await createLinkedInAdapter(deps).fetch(SOURCE, ctx(ledger))

    expect(calls.some((c) => c.url.includes('/trigger'))).toBe(false)
    expect(calls[0].url).toContain('/snapshot/sd_old')
    expect(ledger.triggered).not.toHaveBeenCalled()
    expect(ledger.finished).toHaveBeenCalledWith('sd_old', expect.objectContaining({ status: 'collected' }))
  })

  it('leaves the snapshot for the next run when polls keep failing', async () => {
    const timeouts = Array.from({ length: 5 }, () => new Error('timeout'))
    const { deps } = fakeApi(timeouts)
    const ledger = fakeLedger()

    await expect(createLinkedInAdapter(deps).fetch(SOURCE, ctx(ledger))).rejects.toBeInstanceOf(SnapshotPendingError)
    expect(ledger.finished).not.toHaveBeenCalled() // still 'triggered', so findResumable picks it up
  })

  it('marks the snapshot failed when Bright Data rejects it', async () => {
    const { deps } = fakeApi([json(400, { error: 'bad input' })])
    const ledger = fakeLedger()

    await expect(createLinkedInAdapter(deps).fetch(SOURCE, ctx(ledger))).rejects.toThrow(/failed \(400\)/)
    expect(ledger.finished).toHaveBeenCalledWith('sd_test', expect.objectContaining({ status: 'failed' }))
  })

  it('fails loudly without an API key or a ledger', async () => {
    const { deps } = fakeApi([])
    await expect(createLinkedInAdapter({ ...deps, apiKey: () => undefined }).fetch(SOURCE, ctx(fakeLedger()))).rejects.toThrow(
      /BRIGHTDATA_API_KEY/
    )
    await expect(createLinkedInAdapter(deps).fetch(SOURCE)).rejects.toThrow(/ledger/)
  })
})

/** Each fixture posting through the real normaliser and targeting gates. */
function verdictFor(postingId: string) {
  const posting = toPostings(RECORDS).find((p) => p.sourceJobId === postingId)
  if (!posting) throw new Error(`no fixture ${postingId}`)
  const { job } = normaliseLinkedInPosting(posting.raw as unknown as LinkedInRawPosting, posting.company, posting.applyUrl)
  return assessTarget({ title: job.title, jobType: job.job_type, location: job.location, tags: job.tags, description: job.description })
}

describe('LinkedIn postings through the existing filter', () => {
  it('passes an internship and a graduate program', () => {
    expect(verdictFor('4400000001').verdict).toBe('pass')
    expect(verdictFor('4400000002').verdict).toBe('pass')
  })

  it('keeps a part-time entry-level role', () => {
    expect(verdictFor('4400000003').verdict).toBe('pass')
  })

  it('removes a Senior title', () => {
    expect(verdictFor('4400000004')).toMatchObject({ verdict: 'reject', rule: 'too_senior_title' })
  })

  it('removes a Perth job', () => {
    expect(verdictFor('4400000005')).toMatchObject({ verdict: 'reject', rule: 'location' })
  })

  it("removes a stated 3+ years' experience", () => {
    expect(verdictFor('4400000006')).toMatchObject({ verdict: 'reject', rule: 'experience_required' })
  })

  it('holds the real Delaware North posting as unsure (a specialist title with no level signal)', () => {
    expect(verdictFor('4471733100').verdict).toBe('unsure')
  })
})

/**
 * An in-memory database with the real identity rules: (source, external_id),
 * apply-URL hash, then fingerprint -- what supabase-deps.ts asks Postgres.
 */
function memoryDeps() {
  const rows: StagedInsert[] = []
  const deps: SyncDeps = {
    async findExisting({ externalId, applyUrlHash, fingerprint }) {
      const hit = rows.find(
        (r) => (externalId && r.externalId === externalId) || r.applyUrlHash === applyUrlHash || r.fingerprint === fingerprint
      )
      return hit ? { kind: 'staged', id: hit.externalId ?? '', source: 'sync:linkedin', tier: 'C' } : null
    },
    countPublished: async () => 0,
    stage: async (row) => {
      rows.push(row)
    },
    publish: async () => {
      throw new Error('a tier C source must never publish unattended')
    },
    enrich: async () => {},
    touch: async () => {},
    recordFiltered: async () => {},
  }
  return { rows, deps }
}

describe('the same snapshot delivered twice', () => {
  it('stages each posting once and dedups the repeat', async () => {
    const { rows, deps } = memoryDeps()
    const adapter = { kind: 'aggregator' as const, fetch: async () => toPostings(RECORDS) }
    const normalise = (p: ReturnType<typeof toPostings>[number]) =>
      normaliseLinkedInPosting(p.raw as unknown as LinkedInRawPosting, p.company, p.applyUrl)

    const first = await processSource(SOURCE, adapter, normalise, deps)
    const second = await processSource(SOURCE, adapter, normalise, deps)

    // 7 postings: Senior, Perth and 3+ years rejected; 4 held for review.
    expect(first).toEqual({ ...emptyCounts(), seen: 7, rejected: 3, held: 4 })
    expect(second).toEqual({ ...emptyCounts(), seen: 7, rejected: 3, deduped: 4 })
    expect(rows).toHaveLength(4)
    expect(rows.every((r) => r.riskReasons.includes('tier_b_or_c'))).toBe(true)
  })
})
