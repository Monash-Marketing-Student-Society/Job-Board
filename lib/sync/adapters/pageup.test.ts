import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import dns from 'dns/promises'
import { readFileSync } from 'fs'
import { join } from 'path'
import { pageupAdapter, parsePageUpFeed, type PageUpItem } from './pageup'
import { normalisePageUpPosting, pageUpJobType } from '../normalise'
import type { SourceRow } from './types'

vi.mock('dns/promises', () => ({ default: { lookup: vi.fn() } }))

/** Three items trimmed from Asahi's real feed, 2 Oct 2026 (Melbourne, Sydney, NZ). */
const FEED = readFileSync(join(__dirname, '__fixtures__', 'pageup-feed.xml'), 'utf8')

const ASAHI: SourceRow = {
  id: 'src-asahi',
  slug: 'asahi',
  name: 'Asahi',
  tier: 'A',
  adapter: 'ats',
  endpoint: 'https://careers.pageuppeople.com/527/cw/en/rss',
  config: { vendor: 'pageup' },
}

const text = (body: string, status = 200) => new Response(body, { status, headers: { 'content-type': 'application/rss+xml' } })

describe('parsePageUpFeed', () => {
  const items = parsePageUpFeed(FEED)

  it('reads every item with its PageUp fields', () => {
    expect(items.map((i) => i.title)).toEqual([
      'Supply Chain Lead - StrangeLove',
      'Business Development Executive - Retail ACT',
      'Lead Graphic Designer - NZ',
    ])
    expect(items[0]).toMatchObject({
      location: 'Melbourne',
      workType: 'Permanent - Full Time',
      closingDate: 'Fri, 23 Oct 2026 12:55:00 GMT',
      link: expect.stringMatching(/^https:\/\/careers\.pageuppeople\.com\/527\/cw\/en\/job\/\d+$/),
    })
    expect(items[0].refNo).toMatch(/^\d+$/)
  })

  it("decodes the feed's one layer of escaping, so the description is real HTML", () => {
    expect(items[1].description).toContain('<p>')
    expect(items[1].description).not.toContain('&lt;')
  })

  it('throws on a document that is not an RSS feed', () => {
    expect(() => parsePageUpFeed('<html><body>Maintenance</body></html>')).toThrow(/not an RSS feed/)
  })

  it('skips an item with no link or title', () => {
    const broken = '<rss><channel><item><title>No link</title></item></channel></rss>'
    expect(parsePageUpFeed(broken)).toEqual([])
  })
})

describe('pageupAdapter', () => {
  beforeEach(() => {
    vi.mocked(dns.lookup).mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never)
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => vi.unstubAllGlobals())

  it('makes one request for the whole feed and links each job to its PageUp ad', async () => {
    vi.mocked(fetch).mockResolvedValue(text(FEED))
    const postings = await pageupAdapter.fetch(ASAHI)

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toBe(ASAHI.endpoint)
    expect(postings).toHaveLength(3)
    expect(postings[0].applyUrl).toMatch(/\/527\/cw\/en\/job\/\d+$/)
    expect(postings[0].company).toBe('Asahi')
    expect([...postings[0].read].sort()).toEqual(['applyUrl', 'closing_at', 'company', 'description', 'job_type', 'location', 'title'])
  })

  it('honours config.title_filter', async () => {
    vi.mocked(fetch).mockResolvedValue(text(FEED))
    const postings = await pageupAdapter.fetch({ ...ASAHI, config: { vendor: 'pageup', title_filter: 'graphic|marketing' } })
    expect(postings.map((p) => p.title)).toEqual(['Lead Graphic Designer - NZ'])
  })

  it('throws on a failed request or a non-feed body, so the run records it', async () => {
    vi.mocked(fetch).mockResolvedValue(text('', 503))
    await expect(pageupAdapter.fetch(ASAHI)).rejects.toThrow(/HTTP 503/)
    vi.mocked(fetch).mockResolvedValue(text('<html>login</html>'))
    await expect(pageupAdapter.fetch(ASAHI)).rejects.toThrow(/not a readable RSS feed/)
  })
})

describe('normalisePageUpPosting', () => {
  const [melbourne] = parsePageUpFeed(FEED)

  it('maps location, closing date, job type, posted date and the ad link', () => {
    const { job, confidence } = normalisePageUpPosting(melbourne, 'Asahi')
    expect(job).toMatchObject({
      title: 'Supply Chain Lead - StrangeLove',
      company: 'Asahi',
      location: 'Melbourne',
      job_type: 'full-time',
      closing_at: '2026-10-23T12:55:00.000Z',
      url: melbourne.link,
    })
    expect(job.posted_at).toMatch(/^2026-\d\d-\d\dT/)
    expect(confidence).toMatchObject({ location: 'read', closing_at: 'read', job_type: 'read', description: 'read' })
  })

  it('falls back to the summary when there is no full description', () => {
    const bare: PageUpItem = { ...melbourne, description: null, summary: 'Short summary.' }
    const { job, confidence } = normalisePageUpPosting(bare, 'Asahi')
    expect(job.description).toContain('Short summary.')
    expect(confidence.description).toBeUndefined()
  })
})

describe('pageUpJobType', () => {
  it.each([
    ['Permanent - Full Time', 'full-time'],
    ['Permanent - Part Time', 'part-time'],
    ['Fixed Term - Full Time', 'contract'],
    ['Casual', 'casual'],
    ['Graduate Program', 'graduate'],
    ['Internship - Part Time', 'internship'],
    // Real value from Asahi's feed: "Internal" must not read as an internship.
    ['Fixed Term - Full Time,Internal Secondment', 'contract'],
    ['Interns Program', 'internship'],
    ['Volunteer', null],
    [null, null],
  ])('%s -> %s', (input, expected) => {
    expect(pageUpJobType(input)).toBe(expected)
  })
})
