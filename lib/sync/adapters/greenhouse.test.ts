import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import dns from 'dns/promises'
import { greenhouseAdapter, locationFilter } from './greenhouse'
import greenhouseList from './__fixtures__/greenhouse-list.json'
import { normaliseGreenhousePosting, type GreenhouseRawPosting } from '../normalise'
import type { SourceRow } from './types'

vi.mock('dns/promises', () => ({
  default: { lookup: vi.fn() },
}))

const PUBLIC_ADDR = [{ address: '93.184.216.34', family: 4 }]

const SOURCE: SourceRow = {
  id: 'src-2',
  slug: 'ogilvy',
  name: 'Ogilvy',
  tier: 'A',
  adapter: 'ats',
  endpoint: 'https://boards-api.greenhouse.io/v1/boards/ogilvyaus',
  config: { vendor: 'greenhouse' },
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('greenhouseAdapter', () => {
  beforeEach(() => {
    vi.mocked(dns.lookup).mockResolvedValue(PUBLIC_ADDR as never)
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('makes one GET for the whole board, asking for content', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(greenhouseList))

    await greenhouseAdapter.fetch(SOURCE)

    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(String(url)).toBe(`${SOURCE.endpoint}/jobs?content=true`)
    expect(init?.method ?? 'GET').toBe('GET')
  })

  it('tolerates a trailing slash on the configured endpoint', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(greenhouseList))
    await greenhouseAdapter.fetch({ ...SOURCE, endpoint: `${SOURCE.endpoint}/` })
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toBe(`${SOURCE.endpoint}/jobs?content=true`)
  })

  it('maps each posting: id as the source job id, absolute_url to apply, company from sources.name', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(greenhouseList))

    const postings = await greenhouseAdapter.fetch(SOURCE)

    expect(postings).toHaveLength(greenhouseList.jobs.length)
    const [first] = postings
    const src = greenhouseList.jobs[0]
    expect(first.sourceJobId).toBe(String(src.id))
    expect(first.applyUrl).toBe(src.absolute_url)
    expect(first.title).toBe(src.title)
    expect(first.company).toBe('Ogilvy')
    expect(first.raw).toEqual(src)
  })

  it('marks only what the posting actually carried as read -- never closing_at on a null deadline', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(greenhouseList))

    const [first] = await greenhouseAdapter.fetch(SOURCE)

    expect(greenhouseList.jobs[0].application_deadline).toBeNull()
    expect([...first.read].sort()).toEqual(['applyUrl', 'company', 'description', 'location', 'title'])
  })

  it('skips a malformed posting without failing the rest of the board', async () => {
    const broken = { jobs: [{ id: 1, title: '', absolute_url: null }, ...greenhouseList.jobs] }
    vi.mocked(fetch).mockResolvedValue(jsonResponse(broken))

    const postings = await greenhouseAdapter.fetch(SOURCE)
    expect(postings).toHaveLength(greenhouseList.jobs.length)
  })

  it('keeps only postings whose location matches config.location_filter', async () => {
    const board = {
      jobs: [
        { ...greenhouseList.jobs[0], location: { name: 'Melbourne, Victoria, Australia' } },
        { ...greenhouseList.jobs[1], id: 2, location: { name: 'Hamburg, Hamburg, Germany' } },
        { ...greenhouseList.jobs[1], id: 3, location: null },
      ],
    }
    vi.mocked(fetch).mockResolvedValue(jsonResponse(board))
    const postings = await greenhouseAdapter.fetch({ ...SOURCE, config: { vendor: 'greenhouse', location_filter: 'australia' } })
    expect(postings.map((p) => p.sourceJobId)).toEqual([String(greenhouseList.jobs[0].id)])
  })

  it('throws on an invalid location_filter instead of reading the whole board', () => {
    expect(() => locationFilter({ ...SOURCE, config: { location_filter: '(oops' } })).toThrow(/invalid/)
    expect(locationFilter({ ...SOURCE, config: {} })).toBeNull()
  })

  it('throws on a non-2xx, even with a JSON body -- a wrong board token must not read as an empty board', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ status: 404, error: 'Not found' }, 404))
    await expect(greenhouseAdapter.fetch(SOURCE)).rejects.toThrow(/HTTP 404/)
  })

  it('throws when the body has no jobs array', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ meta: { total: 0 } }))
    await expect(greenhouseAdapter.fetch(SOURCE)).rejects.toThrow(/no jobs array/)
  })

  it('returns an empty list for a board with no openings (the zero guard judges that, not the adapter)', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ jobs: [], meta: { total: 0 } }))
    expect(await greenhouseAdapter.fetch(SOURCE)).toEqual([])
  })

  it('produces raw postings the Greenhouse normaliser reads end to end', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(greenhouseList))

    const [first] = await greenhouseAdapter.fetch(SOURCE)
    const { job } = normaliseGreenhousePosting(first.raw as unknown as GreenhouseRawPosting, first.company)

    expect(job.location).toBe('Melbourne, Australia')
    expect(job.posted_at).toBe(greenhouseList.jobs[0].first_published)
    expect(job.description).toContain('<p>')
    expect(job.description).not.toContain('&lt;')
  })
})
