import { describe, it, expect } from 'vitest'
import { vendorFor } from './vendors'
import { workdayAdapter } from './adapters/workday'
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
    expect(() => vendorFor(source({ vendor: 'greenhouse' }))).toThrow(/no known vendor/)
  })
})
