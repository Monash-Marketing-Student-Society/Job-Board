import { describe, it, expect } from 'vitest'
import { assessRisk, NEW_ADAPTER_REVIEW_COUNT, type RiskInput } from './risk'
import type { NormalisedJob } from './normalise'

const CLEAN_JOB: NormalisedJob = {
  title: '2027 Graduate Program — Brand',
  company: 'Unilever',
  location: 'Melbourne',
  work_mode: null,
  job_type: 'graduate',
  url: 'https://unilever.wd3.myworkdayjobs.com/Unilever_Early_Careers/job/Melbourne/Grad_R-1188260',
  description: '<p>Role</p>',
  tags: ['Brand'],
  posted_at: null,
  closing_at: '2026-12-01',
}

function input(overrides: Partial<RiskInput> = {}): RiskInput {
  return {
    job: CLEAN_JOB,
    confidence: { title: 'read', closing_at: 'read', location: 'read', job_type: 'read' },
    tier: 'A',
    verdict: 'pass',
    publishedFromSource: 50,
    reviewOnly: false,
    ...overrides,
  }
}

describe('assessRisk', () => {
  it('holds nothing for a complete, all-read, tier-A posting from an established source', () => {
    expect(assessRisk(input())).toEqual([])
  })

  it('holds every tier B or C posting', () => {
    expect(assessRisk(input({ tier: 'B' }))).toContain('tier_b_or_c')
    expect(assessRisk(input({ tier: 'C' }))).toContain('tier_b_or_c')
  })

  it('holds each missing required field under its own reason', () => {
    expect(assessRisk(input({ job: { ...CLEAN_JOB, title: '  ' } }))).toContain('missing_title')
    expect(assessRisk(input({ job: { ...CLEAN_JOB, company: '' } }))).toContain('missing_company')
    expect(assessRisk(input({ job: { ...CLEAN_JOB, job_type: null } }))).toContain('missing_job_type')
    expect(assessRisk(input({ job: { ...CLEAN_JOB, closing_at: null } }))).toContain('missing_closing_date')
  })

  it('holds an apply URL that is missing or not job-specific', () => {
    expect(assessRisk(input({ job: { ...CLEAN_JOB, url: '' } }))).toContain('no_direct_link')
    expect(assessRisk(input({ job: { ...CLEAN_JOB, url: 'https://example.com/careers' } }))).toContain('no_direct_link')
  })

  it('holds a guessed closing date, location or job type', () => {
    const reasons = assessRisk(
      input({ confidence: { closing_at: 'inferred', location: 'inferred', job_type: 'inferred' } })
    )
    expect(reasons).toEqual(
      expect.arrayContaining(['inferred_closing_date', 'inferred_location', 'inferred_job_type'])
    )
  })

  it('does not hold a posting for inferred tags alone -- keyword inference is the only source of tags', () => {
    expect(assessRisk(input({ confidence: { closing_at: 'read', tags: 'inferred' } }))).toEqual([])
  })

  it('holds a posting the targeting gates were unsure about', () => {
    expect(assessRisk(input({ verdict: 'unsure' }))).toContain('classifier_unsure')
  })

  it('holds the first jobs from a new adapter, and stops at the threshold', () => {
    expect(assessRisk(input({ publishedFromSource: 0 }))).toContain('new_adapter')
    expect(assessRisk(input({ publishedFromSource: NEW_ADAPTER_REVIEW_COUNT - 1 }))).toContain('new_adapter')
    expect(assessRisk(input({ publishedFromSource: NEW_ADAPTER_REVIEW_COUNT }))).not.toContain('new_adapter')
  })

  it('holds everything while a source is still review-only', () => {
    expect(assessRisk(input({ reviewOnly: true }))).toEqual(['review_only_mode'])
  })

  it('reports every reason at once, not just the first', () => {
    const reasons = assessRisk(
      input({ tier: 'B', job: { ...CLEAN_JOB, closing_at: null, job_type: null }, reviewOnly: true })
    )
    expect(reasons).toEqual(
      expect.arrayContaining(['tier_b_or_c', 'missing_closing_date', 'missing_job_type', 'review_only_mode'])
    )
  })
})
