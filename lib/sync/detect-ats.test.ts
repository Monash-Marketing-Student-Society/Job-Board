import { describe, it, expect } from 'vitest'
import { detectAts } from './detect-ats'

describe('detectAts: Workday', () => {
  it('reads tenant and site from a career-site link (the live sources)', () => {
    expect(detectAts('https://unilever.wd3.myworkdayjobs.com/Unilever_Early_Careers')).toEqual({
      vendor: 'workday',
      endpoint: 'https://unilever.wd3.myworkdayjobs.com/wday/cxs/unilever/Unilever_Early_Careers',
    })
  })

  it('skips a locale segment', () => {
    // Uniqlo's AU graduates board, from the PRD's employer list
    expect(detectAts('https://fastretailing.wd3.myworkdayjobs.com/en-US/graduates_au_Uniqlo')?.endpoint).toBe(
      'https://fastretailing.wd3.myworkdayjobs.com/wday/cxs/fastretailing/graduates_au_Uniqlo'
    )
  })

  it('takes the site from a single job link', () => {
    const url =
      'https://mars.wd3.myworkdayjobs.com/en-US/External/job/AUS-New-South-Wales-Wyong/Production-Operators_R119206-1/apply'
    expect(detectAts(url)?.endpoint).toBe('https://mars.wd3.myworkdayjobs.com/wday/cxs/mars/External')
  })

  it('accepts a cxs API link as given', () => {
    expect(detectAts('https://pg.wd5.myworkdayjobs.com/wday/cxs/pg/1000/jobs')?.endpoint).toBe(
      'https://pg.wd5.myworkdayjobs.com/wday/cxs/pg/1000'
    )
  })

  it('reads tenant and site from the myworkdaysite domain (Mondelēz, News Corp)', () => {
    expect(detectAts('https://wd3.myworkdaysite.com/recruiting/mdlz/External/login')?.endpoint).toBe(
      'https://wd3.myworkdaysite.com/wday/cxs/mdlz/External'
    )
    expect(
      detectAts('https://wd1.myworkdaysite.com/en-US/recruiting/newscorpaustralia/News_Corp_Australia_Careers/jobs')?.endpoint
    ).toBe('https://wd1.myworkdaysite.com/wday/cxs/newscorpaustralia/News_Corp_Australia_Careers')
    expect(detectAts('https://wd3.myworkdaysite.com/en-US')).toBeNull()
  })

  it('refuses a bare Workday host with no site', () => {
    expect(detectAts('https://mars.wd3.myworkdayjobs.com/')).toBeNull()
    expect(detectAts('https://mars.wd3.myworkdayjobs.com/en-US')).toBeNull()
  })
})

describe('detectAts: Greenhouse', () => {
  const OGILVY = { vendor: 'greenhouse', endpoint: 'https://boards-api.greenhouse.io/v1/boards/ogilvyaus' }

  it('reads the board token from every public board shape', () => {
    expect(detectAts('https://job-boards.greenhouse.io/ogilvyaus')).toEqual(OGILVY)
    expect(detectAts('https://job-boards.greenhouse.io/ogilvyaus/jobs/4738297005')).toEqual(OGILVY)
    expect(detectAts('https://boards.greenhouse.io/OgilvyAUS')).toEqual(OGILVY)
    expect(detectAts('https://boards.greenhouse.io/embed/job_board?for=ogilvyaus')).toEqual(OGILVY)
    expect(detectAts('https://boards-api.greenhouse.io/v1/boards/ogilvyaus/jobs?content=true')).toEqual(OGILVY)
  })

  it('refuses an embed link with no board token', () => {
    expect(detectAts('https://boards.greenhouse.io/embed/job_board')).toBeNull()
  })
})

describe('detectAts: anything else', () => {
  it('returns null for job systems we have no adapter for, and for junk', () => {
    expect(detectAts('https://careers.mars.com/au/en/graduate-program')).toBeNull() // Phenom
    expect(detectAts('https://www.pgcareers.com/global/en')).toBeNull()
    expect(detectAts('https://jobs.lever.co/acme')).toBeNull()
    expect(detectAts('not a url')).toBeNull()
    expect(detectAts('javascript:alert(1)')).toBeNull()
  })
})
