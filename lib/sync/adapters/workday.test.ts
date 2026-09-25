import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import dns from 'dns/promises'
import { workdayAdapter } from './workday'
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

  it('throws when the list request itself fails, so the run records the error', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 500 }))

    await expect(workdayAdapter.fetch(SOURCE)).rejects.toThrow()
  })

  it('refuses a source whose endpoint resolves to a private address, same as any other transport failure', async () => {
    vi.mocked(dns.lookup).mockResolvedValue([{ address: '169.254.169.254', family: 4 }] as never)

    await expect(workdayAdapter.fetch({ ...SOURCE, endpoint: 'https://internal.test/wday/cxs/x/y' })).rejects.toThrow()
    expect(fetch).not.toHaveBeenCalled() // fetchPublicUrl's own SSRF guard blocks it before any request goes out
  })
})
