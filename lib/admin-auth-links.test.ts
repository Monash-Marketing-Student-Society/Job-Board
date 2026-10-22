import { describe, it, expect } from 'vitest'
import { buildAuthConfirmUrl, parseAdminAuthLinkType } from './admin-auth-links'

describe('parseAdminAuthLinkType', () => {
  it('accepts only the two link types we issue', () => {
    expect(parseAdminAuthLinkType('invite')).toBe('invite')
    expect(parseAdminAuthLinkType('recovery')).toBe('recovery')
    expect(parseAdminAuthLinkType('magiclink')).toBeNull()
    expect(parseAdminAuthLinkType('email_change')).toBeNull()
    expect(parseAdminAuthLinkType(null)).toBeNull()
  })
})

describe('buildAuthConfirmUrl', () => {
  it('points at our own confirm page with the token in the query, not a fragment', () => {
    const url = new URL(buildAuthConfirmUrl('https://jobs.monashmss.com', 'abc123', 'invite'))
    expect(url.origin).toBe('https://jobs.monashmss.com')
    expect(url.pathname).toBe('/auth/confirm')
    expect(url.searchParams.get('token_hash')).toBe('abc123')
    expect(url.searchParams.get('type')).toBe('invite')
    expect(url.hash).toBe('')
  })

  it('ignores a trailing slash on the app URL', () => {
    expect(buildAuthConfirmUrl('https://jobs.monashmss.com/', 'x', 'recovery')).toBe(
      'https://jobs.monashmss.com/auth/confirm?token_hash=x&type=recovery'
    )
  })
})
