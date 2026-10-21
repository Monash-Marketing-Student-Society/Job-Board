import { describe, it, expect } from 'vitest'
import { canonicalCompanyUrl, companyRef, employeesMin, isSydneyRecord, needsEmployerSize, toCompanySizes } from './linkedin-companies'

describe('canonicalCompanyUrl', () => {
  it('strips the country subdomain, tracking query and case', () => {
    expect(canonicalCompanyUrl('https://au.linkedin.com/company/Hatch-Team?trk=public_jobs_topcard-org-name')).toBe(
      'https://www.linkedin.com/company/hatch-team'
    )
  })
  it('keeps a school page as a school', () => {
    expect(canonicalCompanyUrl('https://au.linkedin.com/school/australianinstituteofcompanydirectors/?trk=x')).toBe(
      'https://www.linkedin.com/school/australianinstituteofcompanydirectors'
    )
  })
  it('refuses anything that is not a LinkedIn company page', () => {
    expect(canonicalCompanyUrl('https://example.com/company/x')).toBeNull()
    expect(canonicalCompanyUrl('https://www.linkedin.com/jobs/view/123')).toBeNull()
    expect(canonicalCompanyUrl(null)).toBeNull()
  })
})

describe('employeesMin', () => {
  it('reads the lower bound of a size band', () => {
    expect(employeesMin('51-200 employees')).toBe(51)
    expect(employeesMin('10,001+ employees')).toBe(10001)
    expect(employeesMin('2-10 employees')).toBe(2)
  })
  it('is null with no size', () => {
    expect(employeesMin(null)).toBeNull()
    expect(employeesMin('')).toBeNull()
  })
})

describe('companyRef / isSydneyRecord', () => {
  it('reads the employer a job record names', () => {
    expect(companyRef({ company_id: 123, company_url: 'https://au.linkedin.com/company/x?trk=y' })).toEqual({
      companyId: '123',
      url: 'https://www.linkedin.com/company/x',
    })
    expect(companyRef({ company_id: '1' })).toBeNull()
  })
  it('places a record in Sydney from its job location', () => {
    expect(isSydneyRecord({ job_location: 'Sydney, New South Wales, Australia' })).toBe(true)
    expect(isSydneyRecord({ job_location: 'Melbourne, Victoria, Australia' })).toBe(false)
  })
})

describe('needsEmployerSize', () => {
  it('covers Sydney programs, and blue-collar industries in any city', () => {
    expect(needsEmployerSize({ job_title: 'Marketing Intern', job_location: 'Sydney, New South Wales, Australia', job_industries: 'Retail' })).toBe(true)
    expect(needsEmployerSize({ job_title: 'Brand Assistant', job_employment_type: 'Internship', job_location: 'Sydney, NSW', job_industries: 'Retail' })).toBe(true)
    // Removed by the Sydney rule whatever the size: not worth a lookup.
    expect(needsEmployerSize({ job_title: 'Marketing Coordinator', job_location: 'Sydney, New South Wales, Australia', job_industries: 'Retail' })).toBe(false)
    expect(needsEmployerSize({ job_location: 'Melbourne, Victoria, Australia', job_industries: 'Wholesale Building Materials' })).toBe(true)
    expect(needsEmployerSize({ job_location: 'Melbourne, Victoria, Australia', job_industries: 'Retail' })).toBe(false)
  })
})

describe('toCompanySizes', () => {
  const asked = [
    { companyId: '1', url: 'https://www.linkedin.com/company/hatch-team' },
    { companyId: '2', url: 'https://www.linkedin.com/company/tiktok' },
    { companyId: '3', url: 'https://www.linkedin.com/company/gone' },
  ]
  const found = toCompanySizes(asked, [
    { input: { url: 'https://www.linkedin.com/company/hatch-team' }, name: 'Hatch', company_size: '11-50 employees', employees_in_linkedin: 40 },
    { input: { url: 'https://au.linkedin.com/company/tiktok?trk=x' }, name: 'TikTok', company_size: '10,001+ employees' },
    { input: { url: 'https://www.linkedin.com/company/gone' }, error: 'Page not found', error_code: 'dead_page' },
  ])

  it('matches answers to what was asked by canonical URL', () => {
    expect(found.find((f) => f.companyId === '1')).toMatchObject({ name: 'Hatch', employeesMin: 11, employeesOnLinkedIn: 40 })
    expect(found.find((f) => f.companyId === '2')?.employeesMin).toBe(10001)
  })
  it('keeps a failed lookup with no size, so it is not bought again', () => {
    expect(found.find((f) => f.companyId === '3')).toMatchObject({ companySize: null, employeesMin: null })
  })
})
