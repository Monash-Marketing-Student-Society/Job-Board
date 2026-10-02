import { describe, it, expect } from 'vitest'
import { vendorFor, workdayConsentTarget, greenhouseConsentTarget, sitemapJsonLdConsentTarget } from './vendors'
import { workdayAdapter } from './adapters/workday'
import { greenhouseAdapter } from './adapters/greenhouse'
import { sitemapJsonLdAdapter } from './adapters/sitemap-jsonld'
import type { SourceRow, RawPosting } from './adapters/types'
import workdayDetail from './adapters/__fixtures__/workday-detail.json'

const source = (config: Record<string, unknown>): SourceRow => ({
  id: 's',
  slug: 'unilever',
  name: 'Unilever',
  tier: 'A',
  adapter: 'ats',
  endpoint: 'https://example.test',
  config,
})

describe('vendorFor', () => {
  it('resolves workday to its adapter', () => {
    expect(vendorFor(source({ vendor: 'workday' })).adapter).toBe(workdayAdapter)
  })

  it('resolves greenhouse to its adapter', () => {
    expect(vendorFor(source({ vendor: 'greenhouse' })).adapter).toBe(greenhouseAdapter)
  })

  it('resolves sitemap_jsonld to its adapter', () => {
    expect(vendorFor(source({ vendor: 'sitemap_jsonld' })).adapter).toBe(sitemapJsonLdAdapter)
  })

  it("normalises a Workday RawPosting using the posting's own company, not the response's", () => {
    const posting: RawPosting = {
      sourceJobId: 'R-1188260',
      applyUrl: workdayDetail.jobPostingInfo.externalUrl,
      title: workdayDetail.jobPostingInfo.title,
      company: 'Unilever',
      raw: workdayDetail as unknown as Record<string, unknown>,
      read: new Set(),
    }
    const { job } = vendorFor(source({ vendor: 'workday' })).normalise(posting)
    expect(job.company).toBe('Unilever')
    expect(job.closing_at).toBe(workdayDetail.jobPostingInfo.endDate)
  })

  it('throws a clear error for a missing or unknown vendor rather than half-working', () => {
    expect(() => vendorFor(source({}))).toThrow(/no known vendor/)
    expect(() => vendorFor(source({ vendor: 'phenom' }))).toThrow(/no known vendor/)
  })
})

describe('consent targets', () => {
  it('Workday checks the public site path, not the cxs JSON path', () => {
    const mars = { ...source({ vendor: 'workday' }), endpoint: 'https://mars.wd3.myworkdayjobs.com/wday/cxs/mars/External' }
    expect(workdayConsentTarget(mars).toString()).toBe('https://mars.wd3.myworkdayjobs.com/External/')
  })

  it('Greenhouse checks the board API path it reads', () => {
    const ogilvy = { ...source({ vendor: 'greenhouse' }), endpoint: 'https://boards-api.greenhouse.io/v1/boards/ogilvyaus/' }
    expect(greenhouseConsentTarget(ogilvy).toString()).toBe('https://boards-api.greenhouse.io/v1/boards/ogilvyaus/jobs')
  })

  it('sitemap + JSON-LD checks the postings path, not the sitemap', () => {
    const myer = { ...source({ vendor: 'sitemap_jsonld' }), endpoint: 'https://careers.myergroup.com.au/sitemap.xml' }
    expect(sitemapJsonLdConsentTarget(myer).toString()).toBe('https://careers.myergroup.com.au/jobs/')
  })

  it('every registered vendor declares one', () => {
    for (const vendor of ['workday', 'greenhouse', 'sitemap_jsonld']) {
      expect(typeof vendorFor(source({ vendor })).consentTarget).toBe('function')
    }
  })
})
