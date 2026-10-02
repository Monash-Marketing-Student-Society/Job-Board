import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import dns from 'dns/promises'
import { smartRecruitersAdapter, experienceLevels } from './smartrecruiters'
import list from './__fixtures__/smartrecruiters-list.json'
import detail from './__fixtures__/smartrecruiters-detail.json'
import { normaliseSmartRecruitersPosting, type SmartRecruitersRawPosting } from '../normalise'
import type { SourceRow } from './types'

vi.mock('dns/promises', () => ({ default: { lookup: vi.fn() } }))

/** Luxury Escapes, live 2 Oct 2026: an AU entry-level grad role, an AU senior role, a London role. */
const LUXE: SourceRow = {
  id: 'src-luxe',
  slug: 'luxuryescapes',
  name: 'Luxury Escapes',
  tier: 'A',
  adapter: 'ats',
  endpoint: 'https://api.smartrecruiters.com/v1/companies/LuxuryEscapes',
  config: { vendor: 'smartrecruiters', consent: { type: 'explicit' } },
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

function serve(listBody: unknown = list) {
  vi.mocked(fetch).mockImplementation(async (url) =>
    String(url).includes('/postings?') ? json(listBody) : json(detail)
  )
}

const detailCalls = () => vi.mocked(fetch).mock.calls.filter((c) => !String(c[0]).includes('/postings?'))

describe('smartRecruitersAdapter', () => {
  beforeEach(() => {
    vi.mocked(dns.lookup).mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never)
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => vi.unstubAllGlobals())

  it('lists postings 100 at a time and keeps only Australian rows', async () => {
    serve()
    const postings = await smartRecruitersAdapter.fetch(LUXE)
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toBe(`${LUXE.endpoint}/postings?limit=100&offset=0`)
    expect(postings.map((p) => p.title)).toEqual([
      'Luxury Escapes Graduate Program - Software Engineer',
      'Senior Frontend Engineer',
    ])
  })

  it('applies config.experience_levels before any detail request', async () => {
    serve()
    const postings = await smartRecruitersAdapter.fetch({
      ...LUXE,
      config: { ...LUXE.config, experience_levels: ['entry_level', 'internship'] },
    })
    expect(postings.map((p) => p.title)).toEqual(['Luxury Escapes Graduate Program - Software Engineer'])
    expect(detailCalls()).toHaveLength(1)
  })

  it("links each job to its page on the employer's SmartRecruiters careers site", async () => {
    serve()
    const [first] = await smartRecruitersAdapter.fetch(LUXE)
    expect(first.applyUrl).toBe(detail.postingUrl)
    expect(first.company).toBe('Luxury Escapes')
  })

  it('never follows a ref that points off the API host', async () => {
    const evil = { ...list, content: [{ ...list.content[0], ref: 'https://evil.test/steal' }] }
    serve(evil)
    expect(await smartRecruitersAdapter.fetch(LUXE)).toEqual([])
    expect(detailCalls()).toHaveLength(0)
  })

  it('throws when the list fails, and drops just the posting whose detail fails', async () => {
    vi.mocked(fetch).mockResolvedValue(json({ message: 'no' }, 500))
    await expect(smartRecruitersAdapter.fetch(LUXE)).rejects.toThrow(/postings request failed/)

    vi.mocked(fetch).mockImplementation(async (url) => {
      if (String(url).includes('/postings?')) return json(list)
      return String(url).endsWith(list.content[0].id) ? json({}, 500) : json(detail)
    })
    const postings = await smartRecruitersAdapter.fetch(LUXE)
    expect(postings.map((p) => p.title)).toEqual(['Senior Frontend Engineer'])
  })
})

describe('experienceLevels', () => {
  const src = (config: Record<string, unknown>) => ({ ...LUXE, config })
  it('is null when unset and throws on a malformed value', () => {
    expect(experienceLevels(src({}))).toBeNull()
    expect(() => experienceLevels(src({ experience_levels: 'entry_level' }))).toThrow(/malformed/)
  })
})

describe('normaliseSmartRecruitersPosting', () => {
  const raw: SmartRecruitersRawPosting = { ...(list.content[0] as SmartRecruitersRawPosting), detail }

  it('maps location, job type, posted date and description', () => {
    const { job, confidence } = normaliseSmartRecruitersPosting(raw, 'Luxury Escapes', detail.postingUrl)
    expect(job.location).toBe(`${raw.location!.city}, ${raw.location!.region}`)
    expect(job.job_type).toBe('full-time')
    expect(job.posted_at).toBe(raw.releasedDate)
    expect(job.closing_at).toBeNull()
    expect(job.description).toContain('<p>')
    expect(confidence).toMatchObject({ location: 'read', job_type: 'read', description: 'read' })
  })

  it('reads an internship-level posting as an internship whatever its hours', () => {
    const intern = { ...raw, experienceLevel: { id: 'internship', label: 'Internship' } }
    expect(normaliseSmartRecruitersPosting(intern, 'L', 'u').job.job_type).toBe('internship')
  })
})
