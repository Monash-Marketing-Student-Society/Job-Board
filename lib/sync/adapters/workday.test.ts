import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import dns from 'dns/promises'
import { workdayAdapter, resolveFacetIds, locationFacetConfig, titleFilter, type WorkdayFacet } from './workday'
import marsListWithFacets from './__fixtures__/workday-list-facets.json'
import workdayList from './__fixtures__/workday-list.json'
import workdayDetail from './__fixtures__/workday-detail.json'
import type { SourceRow } from './types'

vi.mock('dns/promises', () => ({
  default: { lookup: vi.fn() },
}))

const PUBLIC_ADDR = [{ address: '93.184.216.34', family: 4 }]

const SOURCE: SourceRow = {
  id: 'src-1',
  slug: 'unilever',
  name: 'Unilever',
  tier: 'A',
  adapter: 'ats',
  endpoint: 'https://unilever.wd3.myworkdayjobs.com/wday/cxs/unilever/Unilever_Early_Careers',
  config: {},
}

/** A single-page list response, so tests that don't care about pagination don't have to build one. */
function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
}

describe('workdayAdapter', () => {
  beforeEach(() => {
    vi.mocked(dns.lookup).mockResolvedValue(PUBLIC_ADDR as never)
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('POSTs the list request with the pagination body Workday requires', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(workdayList)).mockResolvedValue(jsonResponse(workdayDetail))

    await workdayAdapter.fetch(SOURCE)

    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(String(url)).toBe(`${SOURCE.endpoint}/jobs`)
    expect(init?.method).toBe('POST')
    expect(JSON.parse(init?.body as string)).toEqual({ appliedFacets: {}, limit: 20, offset: 0, searchText: '' })
  })

  it('fetches the detail endpoint for every listed posting, at endpoint + externalPath', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(workdayList)).mockResolvedValue(jsonResponse(workdayDetail))

    await workdayAdapter.fetch(SOURCE)

    // Fixture has 3 postings, each with a distinct externalPath -- one detail
    // call per posting, at endpoint + that path, beyond the initial list call.
    expect(fetch).toHaveBeenCalledTimes(1 + workdayList.jobPostings.length)
    for (const posting of workdayList.jobPostings) {
      expect(fetch).toHaveBeenCalledWith(`${SOURCE.endpoint}${posting.externalPath}`, expect.anything())
    }
  })

  it('maps a real detail response onto RawPosting correctly', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(workdayList)).mockResolvedValue(jsonResponse(workdayDetail))

    const [posting] = await workdayAdapter.fetch(SOURCE)

    expect(posting.sourceJobId).toBe(workdayDetail.jobPostingInfo.jobReqId)
    expect(posting.applyUrl).toBe(workdayDetail.jobPostingInfo.externalUrl)
    expect(posting.title).toBe(workdayDetail.jobPostingInfo.title)
    // Not read from the response -- Workday's hiringOrganization.name is
    // reliably empty (verified against the real API), so company comes from
    // the source's own configured name instead.
    expect(posting.company).toBe(SOURCE.name)
    expect(posting.raw).toEqual(workdayDetail)
  })

  it('marks location, closing_at and description as read when the detail response has them', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(workdayList)).mockResolvedValue(jsonResponse(workdayDetail))

    const [posting] = await workdayAdapter.fetch(SOURCE)

    expect(posting.read.has('title')).toBe(true)
    expect(posting.read.has('company')).toBe(true)
    expect(posting.read.has('applyUrl')).toBe(true)
    expect(posting.read.has('location')).toBe(true)
    expect(posting.read.has('closing_at')).toBe(true)
    expect(posting.read.has('description')).toBe(true)
  })

  it('does not mark closing_at as read when the detail response has no endDate', async () => {
    const noEndDate = { jobPostingInfo: { ...workdayDetail.jobPostingInfo, endDate: null } }
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(workdayList)).mockResolvedValue(jsonResponse(noEndDate))

    const [posting] = await workdayAdapter.fetch(SOURCE)

    expect(posting.read.has('closing_at')).toBe(false)
  })

  it('GETs the detail endpoint -- the opposite method to the list, which is POST', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(workdayList)).mockResolvedValue(jsonResponse(workdayDetail))

    await workdayAdapter.fetch(SOURCE)

    const [, listInit] = vi.mocked(fetch).mock.calls[0]
    const [, detailInit] = vi.mocked(fetch).mock.calls[1]
    expect(listInit?.method).toBe('POST')
    expect(detailInit?.method).toBe('GET')
    expect(detailInit?.body).toBeUndefined()
  })

  // The real failure, reproduced exactly: Workday answers a wrong-method
  // detail call with HTTP 400 AND a parseable JSON error body. That body used
  // to be returned as if it were the posting, and the adapter crashed on
  // `detail.jobPostingInfo.location`, failing every posting in the source.
  it('skips a posting whose detail call returns a 400 with a JSON error body, instead of crashing', async () => {
    const workday400 = new Response(
      JSON.stringify({ errorCode: 'HTTP_400', errorCaseId: 'X', httpStatus: 400, message: '', messageParams: {} }),
      { status: 400, headers: { 'content-type': 'application/json' } }
    )
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(workdayList))
      .mockResolvedValueOnce(workday400)
      // A fresh Response per call: a body can only be read once, so one
      // shared instance would make the third call fail for the wrong reason.
      .mockImplementation(async () => jsonResponse(workdayDetail))

    const postings = await workdayAdapter.fetch(SOURCE)

    expect(postings).toHaveLength(workdayList.jobPostings.length - 1)
  })

  it('skips a 200 detail response that has no jobPostingInfo', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(workdayList))
      .mockResolvedValueOnce(jsonResponse({ userAuthenticated: false }))
      .mockImplementation(async () => jsonResponse(workdayDetail))

    const postings = await workdayAdapter.fetch(SOURCE)

    expect(postings).toHaveLength(workdayList.jobPostings.length - 1)
  })

  it('treats a 400 on the list request as a transport failure', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ errorCode: 'HTTP_400' }), { status: 400, headers: { 'content-type': 'application/json' } })
    )
    await expect(workdayAdapter.fetch(SOURCE)).rejects.toThrow(/list request failed/)
  })

  it('skips a posting whose detail call fails, without failing the whole source', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(workdayList))
      .mockResolvedValueOnce(jsonResponse(workdayDetail)) // posting 1: ok
      .mockResolvedValueOnce(new Response(null, { status: 500 })) // posting 2: fails
      .mockResolvedValueOnce(jsonResponse(workdayDetail)) // posting 3: ok

    const postings = await workdayAdapter.fetch(SOURCE)

    expect(postings).toHaveLength(2)
  })

  it('paginates when total exceeds one page', async () => {
    const page1 = { total: 25, jobPostings: workdayList.jobPostings }
    const page2 = { total: 25, jobPostings: [workdayList.jobPostings[0]] }

    // First page returns 3 postings (offset 0), so a second list call at
    // offset 20 should follow, given a limit of 20 and total of 25.
    let listCalls = 0
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      const body = init?.body ? JSON.parse(init.body as string) : null
      if (String(url).endsWith('/jobs')) {
        listCalls++
        return jsonResponse(body?.offset === 0 ? page1 : page2)
      }
      return jsonResponse(workdayDetail)
    })

    await workdayAdapter.fetch(SOURCE)

    expect(listCalls).toBe(2)
  })

  it('keeps paging when later pages report total 0, as real Workday does', async () => {
    // Verified on CommBank, 2 Oct 2026: total is 164 on page one, 0 after.
    // Trusting each page's total stopped every source at 40 postings.
    const listing = (n: number) => ({ title: `Role ${n}`, externalPath: `/job/R-${n}`, locationsText: 'Melbourne' })
    const pages: Record<number, unknown> = {
      0: { total: 45, jobPostings: Array.from({ length: 20 }, (_, i) => listing(i)) },
      20: { total: 0, jobPostings: Array.from({ length: 20 }, (_, i) => listing(20 + i)) },
      40: { total: 0, jobPostings: Array.from({ length: 5 }, (_, i) => listing(40 + i)) },
    }
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      if (String(url).endsWith('/jobs')) return jsonResponse(pages[JSON.parse(init?.body as string).offset])
      return jsonResponse(workdayDetail)
    })

    const postings = await workdayAdapter.fetch(SOURCE)
    expect(postings).toHaveLength(45)
  })

  it('stops at an empty page even if the first total overstated', async () => {
    let listCalls = 0
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      if (String(url).endsWith('/jobs')) {
        listCalls++
        const offset = JSON.parse(init?.body as string).offset
        return jsonResponse(offset === 0 ? { total: 500, jobPostings: workdayList.jobPostings } : { total: 0, jobPostings: [] })
      }
      return jsonResponse(workdayDetail)
    })
    await workdayAdapter.fetch(SOURCE)
    expect(listCalls).toBe(2)
  })

  it('skips listings whose title fails config.title_filter, without a detail request', async () => {
    const listing = (title: string, n: number) => ({ title, externalPath: `/job/R-${n}`, locationsText: 'Sydney' })
    vi.mocked(fetch).mockImplementation(async (url) => {
      if (String(url).endsWith('/jobs'))
        return jsonResponse({
          total: 3,
          jobPostings: [listing('Customer Banking Specialist', 1), listing('Brand Marketing Graduate', 2), listing('Retail Sales', 3)],
        })
      return jsonResponse(workdayDetail)
    })

    const postings = await workdayAdapter.fetch({ ...SOURCE, config: { title_filter: 'marketing|brand' } })
    expect(postings).toHaveLength(1)
    const detailCalls = vi.mocked(fetch).mock.calls.filter((c) => !String(c[0]).endsWith('/jobs'))
    expect(detailCalls.map((c) => String(c[0]))).toEqual([`${SOURCE.endpoint}/job/R-2`])
  })

  it('throws when the list request itself fails, so the run records the error', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 500 }))

    await expect(workdayAdapter.fetch(SOURCE)).rejects.toThrow()
  })

  it('refuses a source whose endpoint resolves to a private address, same as any other transport failure', async () => {
    vi.mocked(dns.lookup).mockResolvedValue([{ address: '169.254.169.254', family: 4 }] as never)

    await expect(workdayAdapter.fetch({ ...SOURCE, endpoint: 'https://internal.test/wday/cxs/x/y' })).rejects.toThrow()
    expect(fetch).not.toHaveBeenCalled() // fetchPublicUrl's own SSRF guard blocks it before any request goes out
  })

  describe('config.location_facet', () => {
    const MARS: SourceRow = {
      ...SOURCE,
      slug: 'mars',
      name: 'Mars',
      endpoint: 'https://mars.wd3.myworkdayjobs.com/wday/cxs/mars/External',
      config: { vendor: 'workday', location_facet: { parameter: 'locations', prefix: 'AUS-' } },
    }
    const AU_IDS = [
      'f7694590cd5001399e6bf542b00d358e',
      'f7694590cd5001c5b304f342b00d0c8e',
      'f7694590cd50016992ec0043b00da38e',
    ]

    /** Probe (empty facets) returns the real Mars facets; filtered pages return one short page. */
    function scriptMars(probe: unknown = marsListWithFacets) {
      const lists: Array<Record<string, unknown>> = []
      vi.mocked(fetch).mockImplementation(async (url, init) => {
        if (String(url).endsWith('/jobs')) {
          const body = JSON.parse(init?.body as string)
          lists.push(body)
          if (Object.keys(body.appliedFacets).length === 0) return jsonResponse(probe)
          return jsonResponse({ total: 1, jobPostings: [workdayList.jobPostings[0]] })
        }
        return jsonResponse(workdayDetail)
      })
      return lists
    }

    it('reads the facets from an unfiltered page, then pages with every matching id', async () => {
      const lists = scriptMars()
      const postings = await workdayAdapter.fetch(MARS)

      expect(lists[0].appliedFacets).toEqual({})
      expect(lists[1]).toEqual({ appliedFacets: { locations: AU_IDS }, limit: 20, offset: 0, searchText: '' })
      expect(lists).toHaveLength(2)
      expect(postings).toHaveLength(1)
    })

    it('returns nothing, without an error, when the facet exists but has no matching value this week', async () => {
      const lists = scriptMars({ ...marsListWithFacets, facets: [
        { facetParameter: 'locations', values: [{ descriptor: 'GBR-London', id: 'x' }] },
      ] })
      expect(await workdayAdapter.fetch(MARS)).toEqual([])
      expect(lists).toHaveLength(1)
    })

    it('throws when the tenant has no facet by that name -- a config error must not read as an empty board', async () => {
      scriptMars()
      const wrong = { ...MARS, config: { vendor: 'workday', location_facet: { parameter: 'locationCountry', prefix: 'Australia' } } }
      await expect(workdayAdapter.fetch(wrong)).rejects.toThrow(/no "locationCountry" facet/)
    })

    it('leaves an unconfigured source exactly as before: one list call with empty facets', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(workdayList)).mockResolvedValue(jsonResponse(workdayDetail))
      await workdayAdapter.fetch(SOURCE)
      expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string).appliedFacets).toEqual({})
    })
  })
})

describe('resolveFacetIds', () => {
  const facets = marsListWithFacets.facets as unknown as WorkdayFacet[]

  it('finds values inside a nested facet group, by descriptor prefix, case-insensitively', () => {
    expect(resolveFacetIds(facets, { parameter: 'locations', prefix: 'aus-' })).toHaveLength(3)
  })

  it('distinguishes a missing parameter (null) from no matching value ([])', () => {
    expect(resolveFacetIds(facets, { parameter: 'locationCountry', prefix: 'Australia' })).toBeNull()
    expect(resolveFacetIds(facets, { parameter: 'locations', prefix: 'NZL-' })).toEqual([])
  })

  it('matches a top-level facet too (the P&G shape)', () => {
    const pg: WorkdayFacet[] = [
      { facetParameter: 'locationCountry', values: [{ descriptor: 'Australia', id: 'd903' }, { descriptor: 'Austria', id: 'a1' }] },
    ]
    expect(resolveFacetIds(pg, { parameter: 'locationCountry', prefix: 'Australia' })).toEqual(['d903'])
  })
})

describe('locationFacetConfig', () => {
  const src = (config: Record<string, unknown>) => ({ ...({} as SourceRow), slug: 'x', config })

  it('is null when unset and parses a valid value', () => {
    expect(locationFacetConfig(src({}))).toBeNull()
    expect(locationFacetConfig(src({ location_facet: { parameter: 'locations', prefix: 'AUS-' } }))).toEqual({
      parameter: 'locations',
      prefix: 'AUS-',
    })
  })

  it('throws on a malformed value instead of silently fetching the whole tenant', () => {
    expect(() => locationFacetConfig(src({ location_facet: { parameter: 'locations' } }))).toThrow(/malformed/)
    expect(() => locationFacetConfig(src({ location_facet: 'AUS' }))).toThrow(/malformed/)
  })
})

describe('titleFilter', () => {
  const src = (config: Record<string, unknown>) => ({ ...({} as SourceRow), slug: 'x', config })

  it('is null when unset, case-insensitive when set', () => {
    expect(titleFilter(src({}))).toBeNull()
    expect(titleFilter(src({ title_filter: 'marketing' }))!.test('Senior MARKETING Manager')).toBe(true)
  })

  it('throws on a non-string or invalid pattern rather than reading everything', () => {
    expect(() => titleFilter(src({ title_filter: 42 }))).toThrow(/malformed/)
    expect(() => titleFilter(src({ title_filter: '(unclosed' }))).toThrow(/invalid/)
  })
})
