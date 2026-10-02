import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import dns from 'dns/promises'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  jobAdderAdapter,
  jobAdderConfig,
  jobAdderApplyUrl,
  parseJobList,
  parseJobDetails,
  unwrapJsonp,
  type JobAdderRawPosting,
} from './jobadder'
import { normaliseJobAdderPosting, jobAdderJobType } from '../normalise'
import type { SourceRow } from './types'

vi.mock('dns/promises', () => ({
  default: { lookup: vi.fn() },
}))

const PUBLIC_ADDR = [{ address: '93.184.216.34', family: 4 }]
const FIXTURES = join(__dirname, '__fixtures__')
const LIST = readFileSync(join(FIXTURES, 'jobadder-list.txt'), 'utf8')
const DETAIL = readFileSync(join(FIXTURES, 'jobadder-detail.txt'), 'utf8')
const UNAVAILABLE = readFileSync(join(FIXTURES, 'jobadder-detail-unavailable.txt'), 'utf8')

const SOURCE: SourceRow = {
  id: 'src-yochi',
  slug: 'yochi',
  name: 'Yo-Chi',
  tier: 'A',
  adapter: 'ats',
  endpoint: 'https://apps.jobadder.com/widgets/V1/Jobs',
  config: {
    vendor: 'jobadder',
    key: 'AU6_uxaopqd4cg2uxhjrm6zxpyn3tm',
    page_url: 'https://yochi.com.au/careers/',
    categories: { location: '26694', job_type: '26695' },
    include: { category: '26692', values: ['Support Team'] },
  },
}

const withConfig = (patch: Record<string, unknown>): SourceRow => ({ ...SOURCE, config: { ...SOURCE.config, ...patch } })

const jsonp = (html: string) => `mmss(${JSON.stringify(html)});`
const textResponse = (body: string, status = 200) => new Response(body, { status })

/** Answers list calls with `list(page)` and detail calls with `detail(jobId)`. */
function serve(list: (page: number) => string, detail: (jobId: string) => string = () => DETAIL) {
  vi.mocked(fetch).mockImplementation(async (input) => {
    const url = new URL(String(input))
    if (url.pathname.endsWith('/RenderJobList')) return textResponse(list(Number(url.searchParams.get('pageNumber'))))
    return textResponse(detail(url.searchParams.get('jobID') ?? ''))
  })
}

const calls = () => vi.mocked(fetch).mock.calls.map(([u]) => new URL(String(u)))

describe('unwrapJsonp', () => {
  it('returns the string argument of the real list response', () => {
    expect(unwrapJsonp(LIST)).toContain('ja-job-list')
  })

  it('rejects anything that is not our callback wrapping a string', () => {
    expect(unwrapJsonp('<!DOCTYPE html><title>Error</title>')).toBeNull()
    expect(unwrapJsonp('other("x")')).toBeNull()
    expect(unwrapJsonp('mmss({"a":1})')).toBeNull()
    expect(unwrapJsonp('mmss("x"); alert(1)')).toBeNull()
  })
})

describe('parseJobList (real Yo-Chi list)', () => {
  const entries = parseJobList(unwrapJsonp(LIST)!)

  it('reads id, title, classifications and the posted date of every posting', () => {
    expect(entries.map((e) => e.title)).toEqual(['Venue Leader', 'Operations Specialist', 'Content Creator'])
    const creator = entries[2]
    expect(creator.jobId).toBe('906174')
    expect(creator.postedOn).toBe('2026-09-18')
    expect(creator.classifications).toEqual([
      { id: '26692', label: 'Support Team' },
      { id: '26693', label: 'Marketing' },
      { id: '26694', label: 'Melbourne' },
      { id: '26695', label: 'Permanent / Full Time' },
      { id: '28111', label: 'Support Team' },
    ])
  })

  it('decodes entities in titles', () => {
    const html = '<div class="job"> <h2 class="title"> <a data-job-id="1" href="#">Women&#39;s Buyer</a> </h2> <a class="view-details"'
    expect(parseJobList(html)[0].title).toBe("Women's Buyer")
  })
})

describe('parseJobDetails', () => {
  it('returns the bullet points and description of the real Content Creator posting', () => {
    const details = parseJobDetails(unwrapJsonp(DETAIL)!)
    expect(details?.descriptionHtml).toContain('<ul class="bullet-points">')
    expect(details?.descriptionHtml).not.toContain('Back to search results')
  })

  it('returns null for a filled job', () => {
    expect(parseJobDetails(unwrapJsonp(UNAVAILABLE)!)).toBeNull()
  })
})

describe('jobAdderConfig', () => {
  it('reads a full config', () => {
    expect(jobAdderConfig(SOURCE)).toEqual({
      key: 'AU6_uxaopqd4cg2uxhjrm6zxpyn3tm',
      pageUrl: 'https://yochi.com.au/careers/',
      categories: { location: '26694', jobType: '26695' },
      include: { category: '26692', values: ['Support Team'] },
    })
  })

  it('throws on a missing key or page_url, or a malformed include', () => {
    expect(() => jobAdderConfig(withConfig({ key: undefined }))).toThrow(/config.key/)
    expect(() => jobAdderConfig(withConfig({ page_url: 'not a url' }))).toThrow(/config.page_url/)
    expect(() => jobAdderConfig(withConfig({ include: { category: '26692', values: [] } }))).toThrow(/config.include/)
  })

  it('builds the apply URL on the careers page, keeping its own query', () => {
    expect(jobAdderApplyUrl('https://yochi.com.au/careers/', '906174')).toBe('https://yochi.com.au/careers/?ja-job=906174')
    expect(jobAdderApplyUrl('https://x.test/jobs?lang=en', '1')).toBe('https://x.test/jobs?lang=en&ja-job=1')
  })
})

describe('jobAdderAdapter', () => {
  beforeEach(() => {
    vi.mocked(dns.lookup).mockResolvedValue(PUBLIC_ADDR as never)
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reads only the included category, fetching details for those alone', async () => {
    serve(() => LIST)
    const postings = await jobAdderAdapter.fetch(SOURCE)
    expect(postings.map((p) => p.title)).toEqual(['Operations Specialist', 'Content Creator'])
    const details = calls().filter((u) => u.pathname.endsWith('/RenderJobDetails'))
    expect(details.map((u) => u.searchParams.get('jobID'))).toEqual(['907603', '906174'])
  })

  it('sends the key and a callback on every request', async () => {
    serve(() => LIST)
    await jobAdderAdapter.fetch(SOURCE)
    for (const url of calls()) {
      expect(url.searchParams.get('key')).toBe('AU6_uxaopqd4cg2uxhjrm6zxpyn3tm')
      expect(url.searchParams.get('callback')).toBe('mmss')
    }
  })

  it('maps a posting: job id, apply URL on the careers page, company from sources.name, location and type from config', async () => {
    serve(() => LIST)
    const creator = (await jobAdderAdapter.fetch(SOURCE))[1]
    expect(creator.sourceJobId).toBe('906174')
    expect(creator.applyUrl).toBe('https://yochi.com.au/careers/?ja-job=906174')
    expect(creator.company).toBe('Yo-Chi')
    const raw = creator.raw as unknown as JobAdderRawPosting
    expect(raw.location).toBe('Melbourne')
    expect(raw.jobType).toBe('Permanent / Full Time')
    expect([...creator.read].sort()).toEqual(['applyUrl', 'company', 'description', 'job_type', 'location', 'title'])
  })

  it('reads everything when no include filter is set', async () => {
    serve(() => LIST)
    expect(await jobAdderAdapter.fetch(withConfig({ include: null }))).toHaveLength(3)
  })

  it('pages until a page comes back short', async () => {
    const entry = (i: number) =>
      `<div class="job"> <h2 class="title"> <a data-job-id="${i}" href="#">Brand Intern ${i}</a> </h2> <a class="view-details" href="#">More..</a> </div>`
    const page = (n: number, count: number) => jsonp(Array.from({ length: count }, (_, i) => entry(n * 1000 + i)).join(''))
    serve((n) => (n === 1 ? page(1, 100) : page(2, 3)))
    expect(await jobAdderAdapter.fetch(withConfig({ include: null }))).toHaveLength(103)
    const pages = calls().filter((u) => u.pathname.endsWith('/RenderJobList')).map((u) => u.searchParams.get('pageNumber'))
    expect(pages).toEqual(['1', '2'])
  })

  it('skips a job filled between the list and detail calls', async () => {
    serve(() => LIST, (id) => (id === '907603' ? UNAVAILABLE : DETAIL))
    expect((await jobAdderAdapter.fetch(SOURCE)).map((p) => p.sourceJobId)).toEqual(['906174'])
  })

  it('throws on a non-2xx, so a wrong key fails the run instead of reading as an empty board', async () => {
    vi.mocked(fetch).mockResolvedValue(textResponse('<!DOCTYPE html>', 404))
    await expect(jobAdderAdapter.fetch(SOURCE)).rejects.toThrow(/list request failed for yochi \(HTTP 404\)/)
  })

  it('throws when the body is not a JSONP fragment', async () => {
    vi.mocked(fetch).mockResolvedValue(textResponse('{"jobs":[]}'))
    await expect(jobAdderAdapter.fetch(SOURCE)).rejects.toThrow(/did not return a JSONP HTML fragment/)
  })
})

describe('normaliseJobAdderPosting (real Content Creator posting)', () => {
  const entry = parseJobList(unwrapJsonp(LIST)!)[2]
  const raw: JobAdderRawPosting = {
    ...entry,
    location: 'Melbourne',
    jobType: 'Permanent / Full Time',
    descriptionHtml: parseJobDetails(unwrapJsonp(DETAIL)!)!.descriptionHtml,
  }
  const url = 'https://yochi.com.au/careers/?ja-job=906174'
  const { job, confidence } = normaliseJobAdderPosting(raw, 'Yo-Chi', url)

  it('maps title, location, type, posted date and the apply URL; never a closing date', () => {
    expect(job).toMatchObject({
      title: 'Content Creator',
      company: 'Yo-Chi',
      location: 'Melbourne',
      job_type: 'full-time',
      url,
      posted_at: '2026-09-18',
      closing_at: null,
    })
    expect(confidence).toMatchObject({ location: 'read', job_type: 'read', description: 'read' })
    expect(confidence.closing_at).toBeUndefined()
  })

  it('sanitises the description', () => {
    const dirty = normaliseJobAdderPosting({ ...raw, descriptionHtml: '<p>Hi</p><script>alert(1)</script>' }, 'Yo-Chi', url)
    expect(dirty.job.description).not.toContain('<script')
  })
})

describe('jobAdderJobType', () => {
  it.each([
    ['Permanent / Full Time', 'full-time'],
    ['Part-time', 'part-time'],
    ['Casual', 'casual'],
    ['Contract or Temp', 'contract'],
    ['Internship', 'internship'],
    ['Graduate Program', 'graduate'],
    ['Flexible', null],
    [null, null],
  ])('%s -> %s', (label, expected) => {
    expect(jobAdderJobType(label)).toBe(expected)
  })
})
