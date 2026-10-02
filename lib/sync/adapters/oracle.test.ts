import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import dns from 'dns/promises'
import { oracleAdapter, oracleSite } from './oracle'
import oracleList from './__fixtures__/oracle-list.json'
import oracleDetail from './__fixtures__/oracle-detail.json'
import { normaliseOraclePosting, type OracleRawPosting } from '../normalise'
import type { SourceRow } from './types'

vi.mock('dns/promises', () => ({ default: { lookup: vi.fn() } }))

/** Penfolds / TWE, live 2 Oct 2026. Fixtures are trimmed real responses from it. */
const TWE: SourceRow = {
  id: 'src-twe',
  slug: 'penfolds',
  name: 'Penfolds (TWE)',
  tier: 'A',
  adapter: 'ats',
  endpoint: 'https://ebpm.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1',
  config: { vendor: 'oracle' },
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** List calls get `list`; detail calls get the detail fixture. */
function serve(list: unknown = oracleList) {
  vi.mocked(fetch).mockImplementation(async (url) =>
    String(url).includes('recruitingCEJobRequisitionDetails') ? json(oracleDetail) : json(list)
  )
}

describe('oracleSite', () => {
  it('reads host and site number from the careers-site endpoint', () => {
    expect(oracleSite(TWE)).toEqual({
      origin: 'https://ebpm.fa.us2.oraclecloud.com',
      siteNumber: 'CX_1',
      siteUrl: 'https://ebpm.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1',
    })
  })

  it('throws on an endpoint that is not an Oracle careers site', () => {
    expect(() => oracleSite({ ...TWE, endpoint: 'https://ebpm.fa.us2.oraclecloud.com/hcmUI/' })).toThrow(/careers-site endpoint/)
  })
})

describe('oracleAdapter', () => {
  beforeEach(() => {
    vi.mocked(dns.lookup).mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never)
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => vi.unstubAllGlobals())

  it('asks for the requisition list with expand=requisitionList (without it, none come back)', async () => {
    serve()
    await oracleAdapter.fetch(TWE)
    const first = String(vi.mocked(fetch).mock.calls[0][0])
    expect(first).toContain('/hcmRestApi/resources/latest/recruitingCEJobRequisitions?')
    expect(first).toContain('expand=requisitionList')
    expect(first).toContain('siteNumber=CX_1,limit=25,offset=0')
  })

  it('keeps only Australian requisitions, fetching detail for those alone', async () => {
    serve()
    const postings = await oracleAdapter.fetch(TWE)

    const auRows = oracleList.items[0].requisitionList.filter((r) => r.PrimaryLocationCountry === 'AU')
    expect(postings.map((p) => p.sourceJobId)).toEqual(auRows.map((r) => r.Id))
    const details = vi.mocked(fetch).mock.calls.filter((c) => String(c[0]).includes('Details'))
    expect(details).toHaveLength(auRows.length)
  })

  it("links each job to the employer's own careers-site posting", async () => {
    serve()
    const [first] = await oracleAdapter.fetch(TWE)
    expect(first.applyUrl).toBe(`${TWE.endpoint}/job/${first.sourceJobId}`)
    expect(first.company).toBe('Penfolds (TWE)')
  })

  it('honours config.country', async () => {
    serve()
    const postings = await oracleAdapter.fetch({ ...TWE, config: { vendor: 'oracle', country: 'us' } })
    expect(postings.map((p) => p.title)).toEqual(['Regional Sales Manager-AZ'])
  })

  it('pages until it has read the reported total', async () => {
    const row = (n: number, country = 'AU') => ({ Id: String(n), Title: `Role ${n}`, PrimaryLocation: 'Melbourne', PrimaryLocationCountry: country, PostedDate: '2026-10-01' })
    vi.mocked(fetch).mockImplementation(async (url) => {
      const u = String(url)
      if (u.includes('Details')) return json(oracleDetail)
      const offset = Number(/offset=(\d+)/.exec(u)![1])
      const rows = offset === 0 ? Array.from({ length: 25 }, (_, i) => row(i, 'GB')) : [row(100), row(101)]
      return json({ items: [{ TotalJobsCount: 27, requisitionList: rows }] })
    })
    const postings = await oracleAdapter.fetch(TWE)
    expect(postings.map((p) => p.sourceJobId)).toEqual(['100', '101'])
    expect(vi.mocked(fetch).mock.calls.filter((c) => !String(c[0]).includes('Details'))).toHaveLength(2)
  })

  it('throws when the list fails, so the run records the error', async () => {
    vi.mocked(fetch).mockResolvedValue(json({ title: 'Not Found' }, 404))
    await expect(oracleAdapter.fetch(TWE)).rejects.toThrow(/requisition list failed/)
  })

  it('drops a posting whose detail call fails, keeping the rest', async () => {
    let details = 0
    vi.mocked(fetch).mockImplementation(async (url) => {
      if (!String(url).includes('Details')) return json(oracleList)
      return ++details === 1 ? json({}, 500) : json(oracleDetail)
    })
    const postings = await oracleAdapter.fetch(TWE)
    expect(postings).toHaveLength(1)
  })
})

describe('normaliseOraclePosting', () => {
  const raw: OracleRawPosting = { ...oracleList.items[0].requisitionList[1], detail: oracleDetail.items[0] }

  it('reads title, location and posted date, and links the given apply URL', () => {
    const { job, confidence } = normaliseOraclePosting(raw, 'Penfolds (TWE)', 'https://x.test/job/1')
    expect(job.title).toBe(raw.Title)
    expect(job.location).toBe(raw.PrimaryLocation)
    expect(job.posted_at).toBe(raw.PostedDate)
    expect(job.url).toBe('https://x.test/job/1')
    expect(confidence.location).toBe('read')
  })

  it('keeps the real HTML description', () => {
    const { job, confidence } = normaliseOraclePosting(raw, 'Penfolds (TWE)', 'https://x.test/job/1')
    expect(job.description).toContain('<p>')
    expect(confidence.description).toBe('read')
  })

  it('leaves closing_at null when the employer set no end date, and reads it when they did', () => {
    expect(normaliseOraclePosting(raw, 'P', 'u').job.closing_at).toBeNull()
    const dated = { ...raw, detail: { ...raw.detail, ExternalPostedEndDate: '2026-10-31' } }
    const { job, confidence } = normaliseOraclePosting(dated, 'P', 'u')
    expect(job.closing_at).toBe('2026-10-31')
    expect(confidence.closing_at).toBe('read')
  })

  it('joins description, responsibilities and qualifications in that order', () => {
    const parts = { ...raw, detail: { ExternalDescriptionStr: '<p>A</p>', ExternalResponsibilitiesStr: '<p>B</p>', ExternalQualificationsStr: '<p>C</p>' } }
    const { job } = normaliseOraclePosting(parts, 'P', 'u')
    expect(job.description!.indexOf('A')).toBeLessThan(job.description!.indexOf('B'))
    expect(job.description!.indexOf('B')).toBeLessThan(job.description!.indexOf('C'))
  })
})
