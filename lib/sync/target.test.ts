import { describe, it, expect } from 'vitest'
import { assessTarget, targets, type TargetInput } from './target'

function job(overrides: Partial<TargetInput>): TargetInput {
  return {
    title: 'Graduate Program',
    jobType: 'graduate',
    location: 'Melbourne',
    tags: ['Brand'],
    ...overrides,
  }
}

// The real cases named in the TDD (0bd29e8c-140b-43c6-bd20-730bdf57fc2f,
// "Testing" section), verified end to end through the public targets()
// function rather than any internal gate.
describe('targets — the named TDD cases', () => {
  it('"2027 Graduate Program — Brand, Melbourne" passes', () => {
    expect(
      targets(job({ title: '2027 Graduate Program — Brand, Melbourne', jobType: null, location: 'Melbourne', tags: ['Brand'] }))
    ).toBe('pass')
  })

  it('"Senior Brand Manager" fails on level', () => {
    expect(targets(job({ title: 'Senior Brand Manager', jobType: null, tags: ['Brand'] }))).toBe('reject')
  })

  // Caught by the exclusion filter (engineer/software), not by the function
  // gate returning 'no' -- both land on 'reject', but it's worth being exact
  // about which check actually fires, since the function gate itself treats
  // "no marketing-adjacent tags at all" as 'maybe' (send to review), not 'no'
  // (see the empty-tags test below). The exclusion filter is what makes an
  // obviously-technical title reject outright instead of piling into review.
  it('"Graduate Software Engineer" is rejected -- by the exclusion filter, ahead of the function gate', () => {
    expect(targets(job({ title: 'Graduate Software Engineer', jobType: 'graduate', tags: [] }))).toBe('reject')
  })

  it('"Marketing Internship, Perth" fails on location', () => {
    expect(targets(job({ title: 'Marketing Internship, Perth', jobType: 'internship', location: 'Perth', tags: ['Digital'] }))).toBe(
      'reject'
    )
  })

  it('"Commercial Graduate Program" passes on the general-business-program branch, with no marketing tag at all', () => {
    expect(
      targets(job({ title: 'Commercial Graduate Program', jobType: null, location: 'Sydney', tags: [] }))
    ).toBe('pass')
  })

  // Australian and UK employers spell it "Programme" -- every Unilever
  // early-careers title in the live feed does.
  it('accepts the Commonwealth spelling "Programme" on the business-program branch', () => {
    expect(targets(job({ title: 'Commercial Graduate Programme', jobType: null, location: 'Sydney', tags: [] }))).toBe('pass')
    expect(targets(job({ title: '2027 Graduate Programme', jobType: null, location: 'Melbourne', tags: [] }))).toBe('pass')
    expect(
      targets(job({ title: 'Graduate Development Programme', jobType: null, location: 'Melbourne', tags: [] }))
    ).toBe('pass')
  })

  it('does not let "programme" alone stand in for a graduate program', () => {
    // No "graduate" anywhere: neither gate should treat a bare programme as one.
    expect(targets(job({ title: 'Leadership Programme', jobType: null, location: 'Melbourne', tags: [] }))).toBe('unsure')
  })

  it('"Remote - Australia" returns unsure, even though level and function both pass', () => {
    expect(
      targets(job({ title: 'Marketing Graduate Program', jobType: 'graduate', location: 'Remote - Australia', tags: ['Brand'] }))
    ).toBe('unsure')
  })
})

describe('targets — location gate', () => {
  it('rejects an unambiguous other-city location before either other gate runs', () => {
    // Function gate would return 'no' too (Software is excluded) -- location
    // still has to be the thing that decides, since it's checked first.
    expect(targets(job({ location: 'Brisbane', title: 'Software Engineer', tags: [] }))).toBe('reject')
  })

  it('sends an unresolvable location to review rather than publishing or rejecting', () => {
    expect(targets(job({ location: 'Various locations' }))).toBe('unsure')
  })

  it('passes a Sydney metro suburb the same as the city name itself', () => {
    expect(targets(job({ location: 'Parramatta NSW' }))).toBe('pass')
  })
})

describe('targets — exclusion filter', () => {
  it('rejects an IT title outright, regardless of tags', () => {
    expect(targets(job({ title: 'IT Support Officer', tags: ['Digital'] }))).toBe('reject')
  })

  it('rejects an accounting-only title', () => {
    expect(targets(job({ title: 'Graduate Accountant', jobType: 'graduate', tags: [] }))).toBe('reject')
  })

  it('rejects a legal title', () => {
    expect(targets(job({ title: 'Paralegal', tags: [] }))).toBe('reject')
  })

  it('rejects a trades title', () => {
    expect(targets(job({ title: 'Apprentice Electrician', tags: [] }))).toBe('reject')
  })

  it('does not exclude an Analytics-tagged role for carrying "data" in the title', () => {
    // Deliberately not on the exclusion list -- Analytics is itself
    // marketing-adjacent, and a broad IT/data net would wrongly catch this.
    expect(targets(job({ title: 'Marketing Data & Insights Graduate', jobType: 'graduate', tags: ['Analytics'] }))).toBe('pass')
  })
})

describe('targets — level gate', () => {
  it('passes outright on job_type internship or graduate regardless of title', () => {
    expect(targets(job({ title: 'Marketing Assistant Program', jobType: 'internship', tags: ['Brand'] }))).toBe('pass')
    expect(targets(job({ title: 'Marketing Program', jobType: 'graduate', tags: ['Brand'] }))).toBe('pass')
  })

  it('passes on an entry-level title word with no job_type set', () => {
    for (const word of ['vacationer', 'cadet', 'junior', 'assistant', 'coordinator', 'associate', 'trainee']) {
      expect(targets(job({ title: `Marketing ${word}`, jobType: null, tags: ['Brand'] })), word).toBe('pass')
    }
  })

  it('rejects a seniority marker even when the title also carries a pass keyword', () => {
    expect(targets(job({ title: 'Senior Marketing Coordinator', jobType: null, tags: ['Brand'] }))).toBe('reject')
    for (const word of ['manager', 'head of', 'lead', 'director']) {
      expect(targets(job({ title: `Marketing ${word}`, jobType: null, tags: ['Brand'] })), word).toBe('reject')
    }
  })

  it('rejects any manager title, assistant manager included', () => {
    // Real title, Nestlé, 3 Oct 2026 -- went to review until the committee
    // decided these roles expect industry experience.
    expect(targets(job({ title: 'Assistant Brand Manager', jobType: null, tags: ['Brand'] }))).toBe('reject')
    expect(targets(job({ title: 'Senior Assistant Brand Manager', jobType: null, tags: ['Brand'] }))).toBe('reject')
    expect(targets(job({ title: 'Manager, Marketing Assistants', jobType: null, tags: ['Brand'] }))).toBe('reject')
  })

  it('sends a title with no level signal at all to review, not a reject', () => {
    expect(targets(job({ title: 'Marketing Officer', jobType: null, tags: ['Brand'] }))).toBe('unsure')
  })
})

describe('targets — function gate', () => {
  it('passes on any single marketing-adjacent tag', () => {
    for (const tag of ['Strategy', 'Sales', 'Creative', 'Events', 'Communications', 'Analytics', 'Social Media', 'Digital', 'Brand', 'Product']) {
      expect(targets(job({ tags: [tag as TargetInput['tags'][number]] })), tag).toBe('pass')
    }
  })

  it('rejects Operations or Management tags outright -- a non-empty tag set that misses every marketing-adjacent value is confident enough to reject, unlike no tags at all', () => {
    // Title deliberately avoids any phrase GENERAL_BUSINESS_PROGRAM_PATTERNS
    // would also match ("graduate program" etc.), so this isolates the tag
    // check specifically rather than passing via that other branch.
    expect(targets(job({ title: 'Operations Trainee', jobType: null, tags: ['Operations'] }))).toBe('reject')
    expect(targets(job({ title: 'Management Trainee', jobType: null, tags: ['Management'] }))).toBe('reject')
  })

  it('sends a job with no derivable tags at all to review, not a reject', () => {
    // Uncertainty, not a confident "not marketing" -- the PRD is explicit
    // that anything the keyword rules can't place goes to Gemini, never
    // dropped outright.
    expect(targets(job({ title: 'Marketing Program', jobType: 'graduate', tags: [] }))).toBe('unsure')
  })
})

describe('targets — combined verdict rules', () => {
  it('rejects when location is fine but level and function both fail', () => {
    expect(targets(job({ title: 'Senior Manager', jobType: null, tags: ['Operations'] }))).toBe('reject')
  })

  it('a reject anywhere always wins over an unsure elsewhere', () => {
    expect(targets(job({ title: 'Senior Manager', jobType: null, location: 'Various locations', tags: [] }))).toBe('reject')
  })

  it('needs all three gates clean to pass', () => {
    expect(
      targets({ title: 'Graduate Marketing Program', jobType: 'graduate', location: 'Sydney', tags: ['Brand'] })
    ).toBe('pass')
  })
})

describe('assessTarget — the reason for a reject', () => {
  it('names the rule that fired, with the text behind it', () => {
    expect(assessTarget(job({ location: 'Perth' }))).toEqual({ verdict: 'reject', rule: 'location', evidence: 'Perth' })
    expect(assessTarget(job({ title: 'Paralegal', tags: [] })).rule).toBe('excluded_field')
    expect(assessTarget(job({ title: 'Assistant Brand Manager', jobType: null })).rule).toBe('too_senior_title')
    expect(assessTarget(job({ title: 'Operations Trainee', jobType: null, tags: ['Operations'] })).rule).toBe('not_marketing')
  })

  it('rejects a stated 2+ years requirement even on a graduate title', () => {
    const result = assessTarget(job({ description: '<p>You will bring <strong>3+ years’ experience</strong> in brand.</p>' }))
    expect(result).toEqual({ verdict: 'reject', rule: 'experience_required', evidence: '3+ years’ experience' })
  })

  it('leaves a clean posting alone when the description asks for less', () => {
    expect(assessTarget(job({ description: '0-2 years experience welcome' }))).toEqual({ verdict: 'pass' })
  })
})

// The admin decisions of 12 Oct 2026, from the trial's comments.
describe('assessTarget — description-first rules (12 Oct 2026)', () => {
  const mid = (title: string, description: string | null = null) =>
    assessTarget(job({ title, jobType: null, tags: ['Brand'], description }))

  it('removes mid-level titles: executive, specialist, owner, consultant, partner, strategist', () => {
    for (const title of ['Digital Brand Specialist', 'Account Executive', 'Product Owner', 'Travel Sales Consultant', 'People Partner', 'Content Strategist']) {
      expect(mid(title).rule).toBe('too_senior_title')
    }
  })

  it('keeps a mid-level title that is also an entry route', () => {
    expect(mid('2026 Brand Specialist (e-Commerce) Intern').verdict).not.toBe('reject')
    expect(mid('Graduate Marketing Executive').verdict).not.toBe('reject')
  })

  it('keeps a mid-level title when the description welcomes students', () => {
    expect(mid('Marketing Executive', '<p>Perfect for recent graduates.</p>').verdict).not.toBe('reject')
    expect(mid('Social Specialist', '<p>This is an entry-level role.</p>').verdict).not.toBe('reject')
  })

  it('removes any title whose description states seniority', () => {
    const result = mid('Marketing Coordinator', '<p>You will have a track record of managing a team.</p>')
    expect(result).toMatchObject({ verdict: 'reject', rule: 'too_senior_description' })
    expect(mid('News Editor', '<p>Ideal for an early-to-mid-career journalist.</p>').rule).toBe('too_senior_description')
  })

  it('does not read generic experience wording as seniority', () => {
    for (const text of ['Proven experience in partnerships', 'Experience managing multiple deadlines', 'This role has no direct reports', 'Sales pipeline management']) {
      expect(mid('Marketing Coordinator', `<p>${text}</p>`).verdict).not.toBe('reject')
    }
  })

  it('removes non-marketing roles by title phrase', () => {
    for (const title of ['People Solutions Coordinator', 'Customer Care Team Member', 'Design Assistant (Womenswear)', 'Accounts Payable Officer', 'Game Development Officer - Barkly', 'Retail Merchandiser']) {
      expect(mid(title).rule).toBe('not_marketing')
    }
  })

  it('leaves marketing roles that share a word with those phrases', () => {
    for (const title of ['Junior Media Buyer', 'Junior Graphic Designer', 'Customer Marketing Assistant', 'Social Media Coordinator (Footwear)']) {
      expect(mid(title).verdict).not.toBe('reject')
    }
  })

  it('keeps only programs at professional-services firms', () => {
    const firm = (title: string, company: string) => assessTarget(job({ title, jobType: null, company }))
    expect(firm('Events & Marketing Coordinator', 'Deloitte')).toMatchObject({ verdict: 'reject', rule: 'employer_rule' })
    expect(firm('Marketing Coordinator', 'EY').rule).toBe('employer_rule')
    expect(firm('2027 Graduate Program - Marketing', 'KPMG').verdict).not.toBe('reject')
    expect(firm('Summer Vacationer Program', 'Deloitte').verdict).not.toBe('reject')
    expect(firm('Marketing Coordinator', 'Monkey Agency').verdict).not.toBe('reject')
  })

  it('keeps only the Monash Red Bull Student Marketeer', () => {
    const redBull = (title: string) => assessTarget(job({ title, jobType: null, company: 'Red Bull' }))
    expect(redBull('Student Marketeer - Monash University').verdict).not.toBe('reject')
    expect(redBull('Student Marketeer - La Trobe University').rule).toBe('employer_rule')
  })

  it('removes blue-collar industries at small employers, not consumer manufacturers', () => {
    const industry = (industries: string, employerSize: number | null = 201) => assessTarget(job({ industries, employerSize }))
    expect(industry('Mining').rule).toBe('industry')
    expect(industry('Wholesale Building Materials', 501).rule).toBe('industry')
    expect(industry('Agriculture, Construction, Mining Machinery Manufacturing').rule).toBe('industry')
    expect(industry('Manufacturing').verdict).not.toBe('reject')
    expect(industry('Appliances, Electrical, and Electronics Manufacturing, Industrial Machinery Manufacturing, and Medical Equipment Manufacturing').verdict).not.toBe('reject')
  })

  // 15 Oct 2026: a large national employer in these industries often runs an
  // established graduate program (Reece's Retail Leadership Graduate Program).
  it('keeps blue-collar employers of 1,000+, and sends an unknown size to review', () => {
    expect(assessTarget(job({ title: 'Retail Leadership Graduate Program VIC', industries: 'Wholesale Building Materials', employerSize: 5001 })).verdict).toBe('pass')
    expect(assessTarget(job({ industries: 'Construction', employerSize: 1000 })).verdict).toBe('pass')
    expect(assessTarget(job({ industries: 'Construction', employerSize: null })).verdict).not.toBe('reject')
  })

  it('removes a job closing within two weeks, keeps one with no closing date', () => {
    const now = new Date('2026-10-12T00:00:00Z')
    expect(assessTarget(job({ closingAt: '2026-10-20', now }))).toMatchObject({ verdict: 'reject', rule: 'closing_soon' })
    expect(assessTarget(job({ closingAt: '2026-11-01', now })).verdict).toBe('pass')
    expect(assessTarget(job({ closingAt: null, now })).verdict).toBe('pass')
  })
})

// 21 Oct 2026: in Sydney, only graduate programs and internships at the
// biggest employers.
describe('assessTarget — Sydney: graduate programs and internships at big employers only', () => {
  const sydney = (title: string, employerSize: number | null, jobType: TargetInput['jobType'] = null) =>
    assessTarget(job({ title, jobType, location: 'Sydney, New South Wales, Australia', employerSize }))

  it('removes every other Sydney job, whatever the employer size', () => {
    expect(sydney('Marketing Coordinator', 10001)).toMatchObject({ verdict: 'reject', rule: 'sydney_entry_only' })
    expect(sydney('Account Coordinator', null).rule).toBe('sydney_entry_only')
    expect(sydney('Consumer Insights Analyst', 10001).rule).toBe('sydney_entry_only')
  })

  it('keeps graduate programs, internships, vacationer and cadet roles at 1,000+', () => {
    expect(sydney('Marketing Internship', 1001, 'internship').verdict).toBe('pass')
    expect(sydney('2027 Marketing Graduate Program', 10001).verdict).toBe('pass')
    expect(sydney('Summer Vacationer Program', 5001).verdict).toBe('pass')
    expect(sydney('Trainee Journalist, The Sydney Morning Herald', 1001).verdict).not.toBe('reject')
  })

  it('removes a Sydney program at an employer under 1,000', () => {
    expect(sydney('Social Media Intern', 2)).toMatchObject({ verdict: 'reject', rule: 'employer_size' })
    expect(sydney('Graduate Digital Marketing Associate', 51).rule).toBe('employer_size')
    expect(sydney('Marketing Internship', 999, 'internship').rule).toBe('employer_size')
  })

  it('leaves Melbourne and unknown sizes alone', () => {
    expect(assessTarget(job({ title: 'Social Media Intern', location: 'Melbourne', employerSize: 2 })).verdict).toBe('pass')
    expect(sydney('Social Media Intern', null).verdict).not.toBe('reject')
  })
})

// 22 Oct 2026: an employer on MMSS's list keeps all its Sydney roles.
describe('assessTarget — listed employers keep their Sydney roles', () => {
  const sydney = (title: string, listEmployer: boolean, employerSize: number | null = null) =>
    assessTarget(job({ title, jobType: null, location: 'Sydney, New South Wales, Australia', listEmployer, employerSize }))

  it('keeps a listed employer’s non-program Sydney role', () => {
    expect(sydney('Account Coordinator', true).verdict).toBe('pass')
  })

  it('still removes the same role from an employer not on the list', () => {
    expect(sydney('Account Coordinator', false).rule).toBe('sydney_entry_only')
  })

  it('still applies the other rules to listed employers', () => {
    expect(sydney('Senior Account Manager', true).rule).toBe('too_senior_title')
  })
})
