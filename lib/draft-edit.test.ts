import { describe, expect, it } from 'vitest'
import { parseDraftEdit } from './draft-edit'

const base = {
  title: '  Marketing Intern ',
  company: 'Acme',
  url: 'https://acme.com/jobs/123',
  location: 'Melbourne VIC',
  work_mode: 'hybrid',
  job_type: 'internship',
  description: '<p>Hello</p><script>alert(1)</script>',
  summary: '',
  tags: ['Brand', 'not-a-tag'],
  closing_at: '2026-11-01T00:00:00.000Z',
}

describe('parseDraftEdit', () => {
  it('cleans a valid edit', () => {
    const result = parseDraftEdit(base)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.edit.title).toBe('Marketing Intern')
    expect(result.edit.description).toBe('<p>Hello</p>')
    expect(result.edit.summary).toBeNull()
    expect(result.edit.tags).not.toContain('not-a-tag')
  })

  it('allows no closing date and no job type', () => {
    const result = parseDraftEdit({ ...base, closing_at: null, job_type: '' })
    expect(result).toMatchObject({ ok: true, edit: { closing_at: null, job_type: null } })
  })

  it('drops fields an admin edit must not set', () => {
    const result = parseDraftEdit({ ...base, status: 'approved', is_sponsored: true })
    expect(result.ok && Object.keys(result.edit)).not.toContain('status')
  })

  it.each([
    [{ title: '' }, 'title'],
    [{ url: 'javascript:alert(1)' }, 'url'],
    [{ job_type: 'volunteer' }, 'job_type'],
    [{ closing_at: 'next week' }, 'closing_at'],
  ])('rejects %o', (patch, field) => {
    const result = parseDraftEdit({ ...base, ...patch })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.startsWith(field)).toBe(true)
  })
})
