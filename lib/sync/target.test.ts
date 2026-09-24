import { describe, it, expect } from 'vitest'
import { targets, type TargetInput } from './target'

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
    expect(targets(job({ title: 'Leadership Programme', jobType: null, location: 'Sydney', tags: [] }))).toBe('unsure')
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

  it('sends a title with no level signal at all to review, not a reject', () => {
    expect(targets(job({ title: 'Marketing Executive', jobType: null, tags: ['Brand'] }))).toBe('unsure')
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
