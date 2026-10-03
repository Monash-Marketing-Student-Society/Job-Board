import { describe, it, expect } from 'vitest'
import { normaliseWorkdayPosting, normaliseGreenhousePosting, inferJobFunctions, tidyWorkdayLocation } from './normalise'
import workdayDetail from './adapters/__fixtures__/workday-detail.json'
import greenhouseDetail from './adapters/__fixtures__/greenhouse-detail.json'
import linkedInSnapshot from './adapters/__fixtures__/linkedin-snapshot.json'
import {
  linkedInDescriptionHtml,
  linkedInJobType,
  normaliseLinkedInPosting,
  type LinkedInRawPosting,
} from './normalise'

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

  it('reads first_published as posted_at when the list endpoint supplies it', () => {
    expect(job.posted_at).toBeNull() // the detail fixture has no first_published
    const listed = { ...greenhouseDetail, first_published: '2026-09-28T02:15:37-04:00' }
    expect(normaliseGreenhousePosting(listed, 'Ogilvy').job.posted_at).toBe('2026-09-28T02:15:37-04:00')
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

describe('tidyWorkdayLocation', () => {
  it("rewrites Mars's country-state-city code to a place name", () => {
    expect(tidyWorkdayLocation('AUS-Victoria-Melbourne')).toBe('Melbourne, Victoria')
    expect(tidyWorkdayLocation('AUS-New South Wales-Sydney')).toBe('Sydney, New South Wales')
  })

  it('leaves every other shape alone', () => {
    expect(tidyWorkdayLocation('SYDNEY GO')).toBe('SYDNEY GO')
    expect(tidyWorkdayLocation('North Rocks, Sydney, Australia')).toBe('North Rocks, Sydney, Australia')
    expect(tidyWorkdayLocation('2 Locations')).toBe('2 Locations')
    expect(tidyWorkdayLocation(null)).toBeNull()
  })
})

describe('normaliseWorkdayPosting with a tenant that omits endDate', () => {
  it('gives closing_at null, never undefined', () => {
    const info = { ...workdayDetail.jobPostingInfo } as Record<string, unknown>
    delete info.endDate
    const { job, confidence } = normaliseWorkdayPosting({ jobPostingInfo: info } as never, 'P&G')
    expect(job.closing_at).toBeNull()
    expect(confidence.closing_at).toBeUndefined()
  })
})

describe('normaliseLinkedInPosting', () => {
  const real = linkedInSnapshot[0] as unknown as LinkedInRawPosting
  const linkedInPage = 'https://www.linkedin.com/jobs/view/marketing-specialist-4471733100?_l=en'
  const { job, confidence } = normaliseLinkedInPosting(real, real.company_name, linkedInPage)

  it("reads the real record (Delaware North, 3 Oct 2026)", () => {
    expect(job.title).toBe('Marketing Specialist Paid Media, Head Office')
    expect(job.company).toBe('Delaware North, Australia & New Zealand')
    expect(job.location).toBe('Melbourne, Victoria') // ", Australia" dropped
    expect(job.job_type).toBe('full-time')
    expect(job.posted_at).toBe('2026-09-30T05:20:00.820Z')
  })

  it('closes 30 days after posting, marked as inferred', () => {
    expect(job.closing_at).toBe('2026-10-30T05:20:00.820Z')
    expect(confidence.closing_at).toBe('inferred')
  })

  it('links the LinkedIn job page without its tracking query', () => {
    expect(job.url).toBe('https://www.linkedin.com/jobs/view/4471733100/')
  })

  it("keeps an employer's own apply link as it is", () => {
    const external = 'https://careers.example.com/jobs/1'
    expect(normaliseLinkedInPosting(real, 'X', external).job.url).toBe(external)
  })

  it("strips LinkedIn's show-more widget from the description", () => {
    expect(job.description).toContain('Delaware North Australia is seeking')
    expect(job.description).not.toMatch(/Show (more|less)/)
    expect(job.description).not.toContain('<button')
    expect(job.description).not.toContain('show-more-less')
  })

  it('falls back to the plain-text summary, escaped', () => {
    const { job: plain } = normaliseLinkedInPosting(
      { ...real, job_description_formatted: null, job_summary: 'Pay <b>great</b> & more' },
      'X',
      linkedInPage
    )
    expect(plain.description).toContain('Pay &lt;b&gt;great&lt;/b&gt; &amp; more')
  })

  it('infers marketing tags from the title and description', () => {
    expect(job.tags).toContain('Digital')
  })
})

describe('linkedInDescriptionHtml', () => {
  it('returns markup unchanged when there is no widget around it', () => {
    expect(linkedInDescriptionHtml('<p>Plain</p>')).toBe('<p>Plain</p>')
    expect(linkedInDescriptionHtml(null)).toBeNull()
  })
})

describe('linkedInJobType', () => {
  it('reads internship from seniority, employment type or title, ahead of hours', () => {
    expect(linkedInJobType('Marketing Coordinator', 'Internship', 'Full-time')).toBe('internship')
    expect(linkedInJobType('Marketing Coordinator', 'Entry level', 'Internship')).toBe('internship')
    expect(linkedInJobType('Summer Marketing Intern', 'Not Applicable', 'Full-time')).toBe('internship')
  })

  it('reads graduate from the title only, since LinkedIn has no graduate level', () => {
    expect(linkedInJobType('2027 Graduate Program - Marketing', 'Entry level', 'Full-time')).toBe('graduate')
    expect(linkedInJobType('Marketing Associate', 'Entry level', 'Full-time')).toBe('full-time')
  })

  it('maps hours, with Temporary as contract and unknown types as null', () => {
    expect(linkedInJobType('Brand Assistant', null, 'Part-time')).toBe('part-time')
    expect(linkedInJobType('Brand Assistant', null, 'Temporary')).toBe('contract')
    expect(linkedInJobType('Brand Assistant', null, 'Volunteer')).toBeNull()
    expect(linkedInJobType('Brand Assistant', null, null)).toBeNull()
  })

  it('does not read "internal" or "international" as an internship', () => {
    expect(linkedInJobType('Internal Communications Coordinator', null, 'Full-time')).toBe('full-time')
  })
})
