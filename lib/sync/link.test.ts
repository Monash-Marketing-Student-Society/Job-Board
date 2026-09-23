import { describe, it, expect } from 'vitest'
import { isJobSpecificUrl, classifyLinkCheck, LINK_CHECK_STRIKE_LIMIT } from './link'

describe('isJobSpecificUrl', () => {
  it('accepts a Greenhouse posting URL', () => {
    expect(isJobSpecificUrl('https://boards.greenhouse.io/ogilvyaus/jobs/1234567')).toBe(true)
  })

  it('rejects a Greenhouse listing page', () => {
    expect(isJobSpecificUrl('https://boards.greenhouse.io/ogilvyaus/jobs')).toBe(false)
  })

  it('accepts a Workday posting URL with a req id in the slug', () => {
    expect(
      isJobSpecificUrl(
        'https://unilever.wd3.myworkdayjobs.com/en-US/UnileverCareersSite/job/Melbourne/2027-Graduate-Program---Marketing_R-12345'
      )
    ).toBe(true)
  })

  // Known limitation documented in link.ts: an ATS tenant root with only the
  // org's own slug isn't distinguishable from a posting slug without
  // per-vendor routing knowledge, so it reads as job-specific -- the safe
  // direction (see link.ts). Asserted here so a future change to this is
  // deliberate, not an accidental regression caught later.
  it('cannot tell a Workday tenant root from a posting slug, and defaults to job-specific', () => {
    expect(isJobSpecificUrl('https://unilever.wd3.myworkdayjobs.com/en-US/UnileverCareersSite')).toBe(true)
  })

  it('rejects a bare careers index page', () => {
    expect(isJobSpecificUrl('https://example.com/careers')).toBe(false)
    expect(isJobSpecificUrl('https://example.com/en-au/careers')).toBe(false)
  })

  it('rejects a home page, with or without a path', () => {
    expect(isJobSpecificUrl('https://example.com/')).toBe(false)
    expect(isJobSpecificUrl('https://example.com')).toBe(false)
  })

  it('rejects a generic jobs landing path', () => {
    expect(isJobSpecificUrl('https://example.com/jobs')).toBe(false)
    expect(isJobSpecificUrl('https://example.com/careers/search')).toBe(false)
  })

  it('accepts a generic-looking path carrying a job id query parameter', () => {
    expect(isJobSpecificUrl('https://example.com/careers/search?jobId=98765')).toBe(true)
    expect(isJobSpecificUrl('https://example.com/jobs?gh_jid=1234567')).toBe(true)
  })

  it('does not let an empty job id parameter rescue a generic path', () => {
    expect(isJobSpecificUrl('https://example.com/careers?jobId=')).toBe(false)
  })

  it('treats an unparseable URL as not job-specific', () => {
    expect(isJobSpecificUrl('not a url')).toBe(false)
  })

  it('accepts a SEEK job-specific ad, since that is where the Apply button lives', () => {
    expect(isJobSpecificUrl('https://www.seek.com.au/job/78901234')).toBe(true)
  })

  it('rejects a SEEK company listing page', () => {
    expect(isJobSpecificUrl('https://www.seek.com.au/companies/example-123/jobs')).toBe(false)
  })
})

describe('classifyLinkCheck', () => {
  it('unpublishes immediately on 404', () => {
    expect(classifyLinkCheck({ status: 404, finalUrl: 'https://example.com/careers/grad-2027' })).toEqual({
      outcome: 'unpublish',
      reason: 'dead_link',
    })
  })

  it('unpublishes immediately on 410', () => {
    expect(classifyLinkCheck({ status: 410, finalUrl: 'https://example.com/careers/grad-2027' })).toEqual({
      outcome: 'unpublish',
      reason: 'dead_link',
    })
  })

  it('leaves a 2xx that lands on a job-specific final URL alone', () => {
    expect(classifyLinkCheck({ status: 200, finalUrl: 'https://boards.greenhouse.io/ogilvyaus/jobs/1234567' })).toEqual({
      outcome: 'ok',
    })
  })

  it('unpublishes a 2xx that redirected to a generic final URL', () => {
    expect(classifyLinkCheck({ status: 200, finalUrl: 'https://example.com/careers' })).toEqual({
      outcome: 'unpublish',
      reason: 'link_went_generic',
    })
  })

  it('strikes rather than unpublishes on a 5xx', () => {
    expect(classifyLinkCheck({ status: 503, finalUrl: 'https://example.com/careers/grad-2027' })).toEqual({
      outcome: 'strike',
    })
  })

  it('strikes on no result at all -- timeout, blocked host, or network error', () => {
    expect(classifyLinkCheck(null)).toEqual({ outcome: 'strike' })
  })

  // A bot wall or a rate limit looks like a blocked posting from here, and
  // neither means the job is gone -- only 404/410 are unambiguous enough to
  // unpublish on the spot. Everything else, including these, is a strike.
  it('strikes rather than unpublishes on an ambiguous 4xx (403, 429)', () => {
    expect(classifyLinkCheck({ status: 403, finalUrl: 'https://example.com/careers/grad-2027' })).toEqual({
      outcome: 'strike',
    })
    expect(classifyLinkCheck({ status: 429, finalUrl: 'https://example.com/careers/grad-2027' })).toEqual({
      outcome: 'strike',
    })
  })

  it('sets the strike limit to three, matching the PRD', () => {
    expect(LINK_CHECK_STRIKE_LIMIT).toBe(3)
  })
})
