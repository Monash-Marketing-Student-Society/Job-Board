import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import dns from 'dns/promises'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  sitemapJsonLdAdapter,
  sitemapUrls,
  jobPostingFromHtml,
  urlFilter,
  postingsPath,
  MAX_PAGES,
  MAX_CHILD_SITEMAPS,
  jobPostingFromMicrodata,
} from './sitemap-jsonld'
import { normaliseJsonLdPosting } from '../normalise'
import type { SourceRow } from './types'

vi.mock('dns/promises', () => ({
  default: { lookup: vi.fn() },
}))

const PUBLIC_ADDR = [{ address: '93.184.216.34', family: 4 }]
const FIXTURES = join(__dirname, '__fixtures__')
const SITEMAP = readFileSync(join(FIXTURES, 'jsonld-sitemap.xml'), 'utf8')
const POSTING = readFileSync(join(FIXTURES, 'jsonld-posting.html'), 'utf8')
/** A real Deloitte posting page (jobs.deloitte.com.au, 2 Oct 2026), scripts and styles stripped: microdata, no JSON-LD. */
const MICRODATA = readFileSync(join(FIXTURES, 'microdata-posting.html'), 'utf8')

const BUYING_URL =
  'https://careers.myergroup.com.au/jobs/expression-of-interest-entry-level-buying-opportunities-various-locations'

const SOURCE: SourceRow = {
  id: 'src-myer',
  slug: 'myer',
  name: 'Myer',
  tier: 'A',
  adapter: 'listing',
  endpoint: 'https://careers.myergroup.com.au/sitemap.xml',
  config: { vendor: 'sitemap_jsonld', url_filter: 'entry-level|graduate|marketing' },
}

const withConfig = (config: Record<string, unknown>): SourceRow => ({ ...SOURCE, config: { vendor: 'sitemap_jsonld', ...config } })

function textResponse(body: string, status = 200) {
  return new Response(status === 204 ? null : body, { status, headers: { 'content-type': 'text/html' } })
}

/** Answers the sitemap URL with `sitemap` and every other URL with `page(url)`. */
function serve(sitemap: string, page: (url: string) => Response) {
  vi.mocked(fetch).mockImplementation(async (input) => {
    const url = String(input)
    return url.endsWith('/sitemap.xml') ? textResponse(sitemap) : page(url)
  })
}

const requestedPages = () =>
  vi.mocked(fetch).mock.calls.map(([u]) => String(u)).filter((u) => !u.endsWith('/sitemap.xml'))

describe('sitemapUrls', () => {
  it('reads every <loc> from the real Myer sitemap', () => {
    const urls = sitemapUrls(SITEMAP)
    expect(urls).toHaveLength(5)
    expect(urls).toContain(BUYING_URL)
  })

  it('decodes &amp; in a URL', () => {
    expect(sitemapUrls('<urlset><url><loc>https://x.test/jobs/a?b=1&amp;c=2</loc></url></urlset>')).toEqual([
      'https://x.test/jobs/a?b=1&c=2',
    ])
  })

  it('refuses a sitemap index instead of reading child sitemaps as postings', () => {
    expect(() => sitemapUrls('<sitemapindex><sitemap><loc>https://x.test/s1.xml</loc></sitemap></sitemapindex>')).toThrow(
      /sitemap index/
    )
  })
})

describe('jobPostingFromHtml', () => {
  it('finds the JobPosting on the real Myer page', () => {
    expect(jobPostingFromHtml(POSTING)?.title).toBe('Expression of Interest: Entry-Level Buying Opportunities')
  })

  it('skips a malformed block and reads a valid one after it', () => {
    const html =
      '<script type="application/ld+json">{not json</script>' +
      '<script type="application/ld+json">{"@type":"JobPosting","title":"Brand Intern"}</script>'
    expect(jobPostingFromHtml(html)?.title).toBe('Brand Intern')
  })

  it('returns null for a page with no JobPosting', () => {
    expect(jobPostingFromHtml('<script type="application/ld+json">{"@type":"Organization"}</script>')).toBeNull()
  })
})

describe('jobPostingFromMicrodata (real Deloitte page)', () => {
  const job = jobPostingFromMicrodata(MICRODATA)!

  it('has no JSON-LD, so the JSON-LD reader finds nothing', () => {
    expect(jobPostingFromHtml(MICRODATA)).toBeNull()
  })

  it('reads title, organisation and an ISO posted date', () => {
    expect(job.title).toBe('Private Tax Advisory | Multiple Opportunities Available')
    expect(job.hiringOrganization).toEqual({ name: 'Deloitte Services Pty Ltd' })
    // "Thu Sep 24 16:00:00 UTC 2026" on the page; raw text must not reach a timestamp column.
    expect(job.datePosted).toBe('2026-09-24T16:00:00.000Z')
    expect(job.validThrough).toBeNull()
  })

  it("keeps the description's nested HTML whole", () => {
    expect(String(job.description)).toContain('<p>')
    expect(String(job.description).length).toBeGreaterThan(2000)
  })

  it('lists every address, Melbourne or Sydney first', () => {
    const localities = (job.jobLocation as Array<{ address: { addressLocality: string } }>).map((p) => p.address.addressLocality)
    expect(localities).toEqual(['Melbourne', 'Adelaide', 'Brisbane', 'Hobart', 'Sydney'])
  })

  it('moves a Sydney address ahead of an earlier non-target city', () => {
    const html =
      '<div itemscope itemtype="http://schema.org/JobPosting"><span itemprop="title">Graduate</span>' +
      '<span itemprop="jobLocation" itemscope itemtype="http://schema.org/Place">' +
      '<span itemprop="address" itemscope itemtype="http://schema.org/PostalAddress"><meta itemprop="addressLocality" content="Adelaide"></span>' +
      '<span itemprop="address" itemscope itemtype="http://schema.org/PostalAddress"><meta itemprop="addressLocality" content="Sydney"></span>' +
      '</span></div>'
    const parsed = jobPostingFromMicrodata(html)!
    expect((parsed.jobLocation as Array<{ address: { addressLocality: string } }>)[0].address.addressLocality).toBe('Sydney')
  })

  it("reads ANZ's streetAddress-only location, and finds Melbourne inside it", () => {
    // careers.anz.com (same SuccessFactors platform as Deloitte), 2 Oct 2026.
    const addr = (place: string) =>
      `<span itemprop="address" itemscope itemtype="http://schema.org/PostalAddress"><meta itemprop="streetAddress" content="${place}"></span>`
    const html =
      '<div itemscope itemtype="http://schema.org/JobPosting"><span itemprop="jobLocation" itemscope itemtype="http://schema.org/Place">' +
      addr('Dunedin, NZ') + addr('Melbourne, VIC') +
      '</span><meta itemprop="validThrough" content="Tue Oct 06 18:30:00 UTC 2026"><span itemprop="title">Graduate</span></div>'
    const parsed = jobPostingFromMicrodata(html)!
    expect(parsed.jobLocation).toEqual([
      { '@type': 'Place', address: { addressLocality: 'Melbourne, VIC' } },
      { '@type': 'Place', address: { addressLocality: 'Dunedin, NZ' } },
    ])
    expect(parsed.validThrough).toBe('2026-10-06T18:30:00.000Z')
  })

  it('is null for a page with no JobPosting, or one without a title', () => {
    expect(jobPostingFromMicrodata('<html><body>Search jobs</body></html>')).toBeNull()
    expect(jobPostingFromMicrodata('<div itemscope itemtype="https://schema.org/JobPosting"><span itemprop="title"> </span></div>')).toBeNull()
  })
})

describe('config helpers', () => {
  it('defaults postings_path to /jobs/ and rejects a relative one', () => {
    expect(postingsPath(withConfig({}))).toBe('/jobs/')
    expect(() => postingsPath(withConfig({ postings_path: 'jobs/' }))).toThrow(/malformed config.postings_path/)
  })

  it('url_filter is case-insensitive, null when unset, and throws on a bad pattern', () => {
    expect(urlFilter(withConfig({}))).toBeNull()
    expect(urlFilter(withConfig({ url_filter: 'GRADUATE' }))?.test('/jobs/graduate-program')).toBe(true)
    expect(() => urlFilter(withConfig({ url_filter: '(' }))).toThrow(/invalid config.url_filter/)
  })
})

describe('sitemapJsonLdAdapter', () => {
  beforeEach(() => {
    vi.mocked(dns.lookup).mockResolvedValue(PUBLIC_ADDR as never)
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reads a microdata posting page when there is no JSON-LD (Deloitte)', async () => {
    serve(SITEMAP, () => textResponse(MICRODATA))
    const [first] = await sitemapJsonLdAdapter.fetch(SOURCE)
    expect(first.title).toBe('Private Tax Advisory | Multiple Opportunities Available')
    expect([...first.read].sort()).toEqual(['applyUrl', 'company', 'description', 'location', 'title'])
  })

  it('fetches only the pages whose URL matches url_filter', async () => {
    serve(SITEMAP, () => textResponse(POSTING))
    await sitemapJsonLdAdapter.fetch(SOURCE)
    expect(requestedPages()).toEqual([
      BUYING_URL,
      'https://careers.myergroup.com.au/jobs/expression-of-interest-entry-level-planning-opportunities-various-locations',
    ])
  })

  it('maps a page: its own URL to apply, the JSON-LD identifier as the source job id, company from sources.name', async () => {
    serve(SITEMAP, () => textResponse(POSTING))
    const [first] = await sitemapJsonLdAdapter.fetch(SOURCE)
    expect(first.applyUrl).toBe(BUYING_URL)
    expect(first.sourceJobId).toBe('c12695775fb28b9273997cc04cafa33e')
    expect(first.company).toBe('Myer')
    expect(first.title).toBe('Expression of Interest: Entry-Level Buying Opportunities')
    expect([...first.read].sort()).toEqual(['applyUrl', 'closing_at', 'company', 'description', 'job_type', 'location', 'title'])
  })

  it('reads every posting under /jobs/ when no url_filter is set', async () => {
    serve(SITEMAP, () => textResponse(POSTING))
    await sitemapJsonLdAdapter.fetch(withConfig({}))
    expect(requestedPages()).toHaveLength(5)
  })

  it('ignores sitemap URLs on another host or outside postings_path', async () => {
    const sitemap =
      '<urlset><url><loc>https://evil.test/jobs/graduate</loc></url>' +
      '<url><loc>https://careers.myergroup.com.au/about-graduate</loc></url>' +
      '<url><loc>https://careers.myergroup.com.au/jobs/graduate-marketing</loc></url></urlset>'
    serve(sitemap, () => textResponse(POSTING))
    await sitemapJsonLdAdapter.fetch(SOURCE)
    expect(requestedPages()).toEqual(['https://careers.myergroup.com.au/jobs/graduate-marketing'])
  })

  describe('a sitemap index (Coles: sitemap_index.xml -> sitemap1.xml, sitemap2.xml)', () => {
    const H = 'https://careers.myergroup.com.au'
    const INDEX =
      `<sitemapindex><sitemap><loc>${H}/sitemap1.xml</loc></sitemap>` +
      `<sitemap><loc>${H}/sitemap2.xml</loc></sitemap>` +
      `<sitemap><loc>https://evil.test/sitemap3.xml</loc></sitemap></sitemapindex>`
    const urlset = (...paths: string[]) => `<urlset>${paths.map((p) => `<url><loc>${H}${p}</loc></url>`).join('')}</urlset>`
    const INDEXED = { ...SOURCE, endpoint: `${H}/sitemap_index.xml` }

    function serveIndex(children: Record<string, Response | (() => Response)>) {
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input)
        if (url.endsWith('/sitemap_index.xml')) return textResponse(INDEX)
        const child = children[new URL(url).pathname]
        if (child) return typeof child === 'function' ? child() : child
        return textResponse(POSTING)
      })
    }

    it("reads postings from every same-host child sitemap, deduplicated, and never the other host's", async () => {
      serveIndex({
        '/sitemap1.xml': textResponse(urlset('/jobs/graduate-marketing', '/jobs/store-team-member')),
        '/sitemap2.xml': textResponse(urlset('/jobs/marketing-coordinator', '/jobs/graduate-marketing')),
      })
      await sitemapJsonLdAdapter.fetch(INDEXED)
      const urls = vi.mocked(fetch).mock.calls.map(([u]) => String(u))
      expect(urls.some((u) => u.includes('evil.test'))).toBe(false)
      expect(urls.filter((u) => u.includes('/jobs/'))).toEqual([`${H}/jobs/graduate-marketing`, `${H}/jobs/marketing-coordinator`])
    })

    it('fails the run when a child sitemap fails, rather than reading half the jobs', async () => {
      serveIndex({
        '/sitemap1.xml': textResponse(urlset('/jobs/graduate-marketing')),
        '/sitemap2.xml': () => textResponse('', 503),
      })
      await expect(sitemapJsonLdAdapter.fetch(INDEXED)).rejects.toThrow(/Child sitemap \/sitemap2.xml failed/)
    })

    it('refuses an index nested inside an index', async () => {
      serveIndex({ '/sitemap1.xml': textResponse(INDEX), '/sitemap2.xml': textResponse(urlset()) })
      await expect(sitemapJsonLdAdapter.fetch(INDEXED)).rejects.toThrow(/sitemap index/)
    })

    it('refuses an index listing more child sitemaps than the limit', async () => {
      const many = `<sitemapindex>${Array.from({ length: MAX_CHILD_SITEMAPS + 1 }, (_, i) => `<sitemap><loc>${H}/s${i}.xml</loc></sitemap>`).join('')}</sitemapindex>`
      vi.mocked(fetch).mockImplementation(async () => textResponse(many))
      await expect(sitemapJsonLdAdapter.fetch(INDEXED)).rejects.toThrow(/over the 10 limit/)
    })
  })

  it('throws when more URLs match than the page limit, before fetching any page', async () => {
    const locs = Array.from({ length: MAX_PAGES + 1 }, (_, i) => `<url><loc>https://careers.myergroup.com.au/jobs/graduate-${i}</loc></url>`)
    serve(`<urlset>${locs.join('')}</urlset>`, () => textResponse(POSTING))
    await expect(sitemapJsonLdAdapter.fetch(SOURCE)).rejects.toThrow(/narrow config.url_filter/)
    expect(requestedPages()).toHaveLength(0)
  })

  it('throws when every page is a WAF challenge (empty 202), so a blocked site is a failed run', async () => {
    serve(SITEMAP, () => textResponse('', 202))
    await expect(sitemapJsonLdAdapter.fetch(SOURCE)).rejects.toThrow(/Every posting page failed for myer \(HTTP 202\)/)
  })

  it('skips one failed page among several', async () => {
    serve(SITEMAP, (url) => (url === BUYING_URL ? textResponse('', 503) : textResponse(POSTING)))
    expect(await sitemapJsonLdAdapter.fetch(SOURCE)).toHaveLength(1)
  })

  it('skips a page with no JobPosting without failing the source', async () => {
    serve(SITEMAP, (url) => (url === BUYING_URL ? textResponse('<html></html>') : textResponse(POSTING)))
    expect(await sitemapJsonLdAdapter.fetch(SOURCE)).toHaveLength(1)
  })

  it('throws when the sitemap itself fails', async () => {
    vi.mocked(fetch).mockResolvedValue(textResponse('', 202))
    await expect(sitemapJsonLdAdapter.fetch(SOURCE)).rejects.toThrow(/Sitemap request failed for myer \(HTTP 202\)/)
  })

  it('returns an empty list when nothing matches (the zero guard judges that, not the adapter)', async () => {
    serve(SITEMAP, () => textResponse(POSTING))
    expect(await sitemapJsonLdAdapter.fetch(withConfig({ url_filter: 'astronaut' }))).toEqual([])
  })
})

describe('normaliseJsonLdPosting (real Myer posting)', () => {
  const raw = jobPostingFromHtml(POSTING)!
  const { job, confidence } = normaliseJsonLdPosting(raw, 'Myer', BUYING_URL)

  it('reads title, location, job type and the full validThrough timestamp', () => {
    expect(job.title).toBe('Expression of Interest: Entry-Level Buying Opportunities')
    expect(job.company).toBe('Myer')
    expect(job.url).toBe(BUYING_URL)
    expect(job.location).toBe('Various Locations')
    expect(job.job_type).toBe('full-time')
    expect(job.closing_at).toBe('2026-12-30T16:45:50Z')
    expect(job.posted_at).toBe('2026-07-10T06:29:53Z')
    expect(confidence).toMatchObject({ title: 'read', location: 'read', job_type: 'read', closing_at: 'read', description: 'read' })
  })

  it('sanitises the description', () => {
    expect(job.description).toContain('Merchandise Buying')
    const dirty = normaliseJsonLdPosting({ ...raw, description: '<p>Hi</p><script>alert(1)</script>' }, 'Myer', BUYING_URL)
    expect(dirty.job.description).not.toContain('<script')
  })

  it('leaves closing_at unread when validThrough is missing or not a date', () => {
    for (const validThrough of [undefined, 'soon']) {
      const result = normaliseJsonLdPosting({ ...raw, validThrough }, 'Myer', BUYING_URL)
      expect(result.job.closing_at).toBeNull()
      expect(result.confidence.closing_at).toBeUndefined()
    }
  })
})
