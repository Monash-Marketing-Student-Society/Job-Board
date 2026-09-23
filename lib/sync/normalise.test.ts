import { describe, it, expect } from 'vitest'
import { normaliseWorkdayPosting, normaliseGreenhousePosting, inferJobFunctions } from './normalise'
import workdayDetail from './adapters/__fixtures__/workday-detail.json'
import greenhouseDetail from './adapters/__fixtures__/greenhouse-detail.json'

describe('normaliseWorkdayPosting', () => {
  const { job, confidence } = normaliseWorkdayPosting(workdayDetail, 'Unilever')

  it('reads title, url and closing date straight from the response', () => {
    expect(job.title).toBe(workdayDetail.jobPostingInfo.title)
    expect(job.url).toBe(workdayDetail.jobPostingInfo.externalUrl)
    expect(job.closing_at).toBe(workdayDetail.jobPostingInfo.endDate)
    expect(confidence.title).toBe('read')
    expect(confidence.url).toBe('read')
    expect(confidence.closing_at).toBe('read')
  })

  it('takes company from the source, not the response', () => {
    // Workday's hiringOrganization.name is reliably empty on the real API
    expect(job.company).toBe('Unilever')
    expect(confidence.company).toBe('read')
  })

  it('sanitises the description, which is real HTML on Workday (not entity-escaped)', () => {
    expect(job.description).toContain('<p>')
    expect(job.description).not.toContain('&lt;p&gt;')
    expect(confidence.description).toBe('read')
  })

  it('maps timeType to job_type as a schedule signal, marked read', () => {
    expect(job.job_type).toBe('full-time') // "Full time" in the fixture
    expect(confidence.job_type).toBe('read')
  })

  it('never claims a structured work_mode or posted_at -- neither exists on this response', () => {
    expect(job.work_mode).toBeNull()
    expect(job.posted_at).toBeNull()
    expect(confidence.work_mode).toBeUndefined()
    expect(confidence.posted_at).toBeUndefined()
  })

  it('marks inferred tags as inferred, never read', () => {
    if (job.tags.length > 0) {
      expect(confidence.tags).toBe('inferred')
    }
  })

  it('handles a missing endDate without marking closing_at as read', () => {
    const noEndDate = { jobPostingInfo: { ...workdayDetail.jobPostingInfo, endDate: null } }
    const result = normaliseWorkdayPosting(noEndDate, 'Unilever')
    expect(result.job.closing_at).toBeNull()
    expect(result.confidence.closing_at).toBeUndefined()
  })
})

describe('normaliseGreenhousePosting', () => {
  const { job, confidence } = normaliseGreenhousePosting(greenhouseDetail, 'Ogilvy')

  it('reads title and url straight from the response', () => {
    expect(job.title).toBe(greenhouseDetail.title)
    expect(job.url).toBe(greenhouseDetail.absolute_url)
  })

  it('reads location.name', () => {
    expect(job.location).toBe(greenhouseDetail.location.name)
    expect(confidence.location).toBe('read')
  })

  it('decodes the double-escaped content before sanitising, so real markup survives, not literal entities', () => {
    expect(job.description).toContain('<p>')
    expect(job.description).not.toContain('&lt;')
    expect(job.description).not.toContain('&amp;quot;') // the doubly-escaped inner quotes
  })

  it('leaves closing_at null when application_deadline is null, without marking it read', () => {
    expect(greenhouseDetail.application_deadline).toBeNull()
    expect(job.closing_at).toBeNull()
    expect(confidence.closing_at).toBeUndefined()
  })

  it('leaves job_type null when employment_type is absent from the response entirely', () => {
    expect(job.job_type).toBeNull()
    expect(confidence.job_type).toBeUndefined()
  })

  it('maps a real employment_type value when present', () => {
    const withType = { ...greenhouseDetail, employment_type: 'Full-time' }
    const result = normaliseGreenhousePosting(withType, 'Ogilvy')
    expect(result.job.job_type).toBe('full-time')
    expect(result.confidence.job_type).toBe('read')
  })
})

describe('inferJobFunctions', () => {
  it('finds a single clear keyword', () => {
    expect(inferJobFunctions('Brand Manager', null)).toContain('Brand')
  })

  it('is case-insensitive and matches whole words', () => {
    expect(inferJobFunctions('SOCIAL MEDIA COORDINATOR', null)).toContain('Social Media')
  })

  it('finds a keyword in the description when the title has none', () => {
    expect(inferJobFunctions('Graduate Program', 'You will lead our social media strategy across channels.')).toEqual(
      expect.arrayContaining(['Social Media', 'Strategy'])
    )
  })

  it('returns an empty array when nothing matches, not a guess', () => {
    expect(inferJobFunctions('Warehouse Assistant', 'Pack boxes and load trucks.')).toEqual([])
  })

  it('caps at MAX_JOB_FUNCTIONS even when more keywords match', () => {
    const tags = inferJobFunctions(
      'Brand, Communications, Creative, Digital and Social Media Graduate',
      'Strategy, analytics, sales and events too.'
    )
    expect(tags.length).toBeLessThanOrEqual(3)
  })

  it('classifies an account-management title as Sales, treating agency account management as marketing-adjacent', () => {
    expect(inferJobFunctions('Account Manager', null)).toContain('Sales')
  })

  it('finds nothing in the real Ogilvy Account Manager posting title alone, only via the classified Sales keyword above', () => {
    // Documents the actual behaviour against real data rather than asserting
    // a made-up example: the content itself doesn't repeat "account manager"
    // in a way that changes the outcome versus the title alone.
    const tags = inferJobFunctions(greenhouseDetail.title, null)
    expect(tags).toEqual(['Sales'])
  })
})
