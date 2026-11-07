import { describe, it, expect } from 'vitest'
import { isExpiredRedirect, readPostingResponse } from './posting-check'

const OPEN = '<html><body><h1>Marketing Coordinator</h1><p>Apply now</p></body></html>'

describe('readPostingResponse', () => {
  it('reads LinkedIn’s expired-job redirect as closed (10 live jobs, 7 Nov 2026)', () => {
    const finalUrl = 'https://www.linkedin.com/jobs/brand-manager-jobs?trk=expired_jd_redirect'
    expect(isExpiredRedirect(finalUrl)).toBe(true)
    expect(readPostingResponse({ status: 200, finalUrl, html: OPEN })).toEqual({ state: 'closed', reason: 'LinkedIn: expired job' })
  })

  it('reads a closed notice on a page that still answers 200', () => {
    const html = '<div class="closed-job">No longer accepting applications</div>'
    expect(readPostingResponse({ status: 200, finalUrl: 'https://www.linkedin.com/jobs/view/4480473223/', html })).toMatchObject({ state: 'closed' })
  })

  it('reads a 404 and a redirect to a listing as closed', () => {
    expect(readPostingResponse({ status: 404, finalUrl: 'https://careers.example.com/job/1', html: null })).toEqual({ state: 'closed', reason: 'dead_link' })
    expect(readPostingResponse({ status: 200, finalUrl: 'https://careers.example.com/jobs', html: OPEN })).toEqual({ state: 'closed', reason: 'link_went_generic' })
  })

  it('keeps an open posting open', () => {
    expect(readPostingResponse({ status: 200, finalUrl: 'https://www.linkedin.com/jobs/view/4468383994/', html: OPEN })).toEqual({ state: 'open' })
    // A locale redirect is not an expiry.
    expect(readPostingResponse({ status: 200, finalUrl: 'https://jobs.redbull.com/en/student-marketeer-monash-university--ref33473e', html: OPEN })).toEqual({ state: 'open' })
  })

  it('never closes on an ambiguous answer', () => {
    expect(readPostingResponse(null)).toEqual({ state: 'unknown' })
    expect(readPostingResponse({ status: 999, finalUrl: 'https://www.linkedin.com/jobs/view/1/', html: null })).toEqual({ state: 'unknown' })
    expect(readPostingResponse({ status: 429, finalUrl: 'https://www.linkedin.com/jobs/view/1/', html: null })).toEqual({ state: 'unknown' })
  })
})
