import { describe, it, expect } from 'vitest'
import { AVAILABILITY_EVERY_MS, availabilityDue, closedPostings, linkedInPostingId } from './linkedin-availability'

describe('linkedInPostingId', () => {
  it('reads the id from the URL shapes LinkedIn uses', () => {
    expect(linkedInPostingId('https://www.linkedin.com/jobs/view/4480748607/')).toBe('4480748607')
    expect(linkedInPostingId('https://au.linkedin.com/jobs/view/marketing-intern-at-ferrero-4481573326?trk=x')).toBe('4481573326')
    expect(linkedInPostingId('https://careers.anz.com/job/1359695366/')).toBeNull()
    expect(linkedInPostingId(null)).toBeNull()
  })
})

describe('closedPostings', () => {
  it('closes postings no longer taking applications, and removed ones', () => {
    const closed = closedPostings([
      { job_posting_id: '1', application_availability: false },
      { job_posting_id: '2', application_availability: true },
      { input: { url: 'https://www.linkedin.com/jobs/view/3000000/' }, error: 'Page not found', error_code: 'dead_page' },
    ])
    expect([...closed.keys()]).toEqual(['1', '3000000'])
  })

  it('closes nothing on a failed lookup', () => {
    const closed = closedPostings([{ input: { url: 'https://www.linkedin.com/jobs/view/4000000/' }, error: 'Request blocked', error_code: 'blocked' }])
    expect(closed.size).toBe(0)
  })
})

describe('availabilityDue', () => {
  it('runs every other day', () => {
    const now = new Date('2026-11-09T16:00:00Z')
    expect(availabilityDue(null, now)).toBe(true)
    expect(availabilityDue(new Date(now.getTime() - AVAILABILITY_EVERY_MS).toISOString(), now)).toBe(true)
    expect(availabilityDue(new Date(now.getTime() - 12 * 3_600_000).toISOString(), now)).toBe(false)
  })
})
