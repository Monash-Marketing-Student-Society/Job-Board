import { describe, it, expect } from 'vitest'
import { jobSubmissionSchema } from './job-submission-schema'

// A body the /submit form would send with every field filled.
const full = {
  submitter_name: 'Dana Lee',
  submitter_email: 'dana@acme.example',
  submitter_company_name: 'Acme Pty Ltd',
  title: 'Marketing Intern',
  company: 'Acme',
  url: 'https://acme.example/careers/intern',
  location: 'Melbourne',
  work_mode: 'hybrid',
  job_type: 'internship',
  description: '<p>Join us</p>',
  summary: 'A short intro role.',
  company_logo_url: 'https://acme.example/logo.png',
  tags: ['Brand', 'Strategy'],
  closing_at: '2026-10-01T00:00:00.000Z',
}

// The minimum the form can submit — required fields only.
const minimal = {
  submitter_name: 'Dana Lee',
  submitter_email: 'dana@acme.example',
  submitter_company_name: 'Acme Pty Ltd',
  title: 'Marketing Intern',
  company: 'Acme',
  url: 'https://acme.example/careers/intern',
}

describe('jobSubmissionSchema', () => {
  it('accepts a full valid body', () => {
    expect(jobSubmissionSchema.parse(full)).toMatchObject(full)
  })

  it('accepts a minimal body and fills optionals with null', () => {
    const out = jobSubmissionSchema.parse(minimal)
    expect(out).toMatchObject({
      ...minimal,
      location: null,
      work_mode: null,
      job_type: null,
      description: null,
      summary: null,
      company_logo_url: null,
      tags: null,
      closing_at: null,
    })
  })

  it('strips keys a submitter does not own', () => {
    const out = jobSubmissionSchema.parse({
      ...minimal,
      status: 'approved',
      edit_token: '00000000-0000-0000-0000-000000000000',
      admin_note: 'looks fine',
      archived_at: '2026-01-01T00:00:00.000Z',
      id: 'abc',
      created_at: '2000-01-01T00:00:00.000Z',
    })
    expect(out).not.toHaveProperty('status')
    expect(out).not.toHaveProperty('edit_token')
    expect(out).not.toHaveProperty('admin_note')
    expect(out).not.toHaveProperty('archived_at')
    expect(out).not.toHaveProperty('id')
    expect(out).not.toHaveProperty('created_at')
  })

  it('rejects a missing required field', () => {
    const { company: _omit, ...noCompany } = full
    expect(jobSubmissionSchema.safeParse(noCompany).success).toBe(false)
  })

  it('rejects a malformed email', () => {
    expect(jobSubmissionSchema.safeParse({ ...minimal, submitter_email: 'dana@' }).success).toBe(false)
  })

  it('rejects a non-http(s) url', () => {
    for (const url of ['javascript:alert(1)', 'data:text/html,x', 'ftp://acme.example/x', 'mailto:a@b.c']) {
      expect(jobSubmissionSchema.safeParse({ ...minimal, url }).success).toBe(false)
    }
  })

  it('rejects an unknown work_mode or job_type', () => {
    expect(jobSubmissionSchema.safeParse({ ...minimal, work_mode: 'anywhere' }).success).toBe(false)
    expect(jobSubmissionSchema.safeParse({ ...minimal, job_type: 'freelance' }).success).toBe(false)
  })

  it('rejects an over-long title', () => {
    expect(jobSubmissionSchema.safeParse({ ...minimal, title: 'x'.repeat(201) }).success).toBe(false)
  })

  it('rejects a non-ISO closing_at', () => {
    expect(jobSubmissionSchema.safeParse({ ...minimal, closing_at: '2026-10-01' }).success).toBe(false)
  })

  it('rejects tags that are not an array of strings', () => {
    expect(jobSubmissionSchema.safeParse({ ...minimal, tags: 'Brand,Strategy' }).success).toBe(false)
    expect(jobSubmissionSchema.safeParse({ ...minimal, tags: [1, 2] }).success).toBe(false)
  })

  it('trims surrounding whitespace and collapses blank optionals to null', () => {
    const out = jobSubmissionSchema.parse({
      ...minimal,
      submitter_name: '  Dana Lee  ',
      location: '   ',
    })
    expect(out.submitter_name).toBe('Dana Lee')
    expect(out.location).toBeNull()
  })
})
