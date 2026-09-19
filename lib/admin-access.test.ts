import { describe, it, expect } from 'vitest'
import {
  normalizeEmail,
  parseAutoApproveDomains,
  emailMatchesAutoApprovedDomain,
  safeAdminRedirectPath,
} from './admin-access'

describe('normalizeEmail', () => {
  it('lowercases and trims, matching the CHECK on admin_invites.email', () => {
    expect(normalizeEmail('  Partnerships@MonashMSS.com ')).toBe('partnerships@monashmss.com')
  })
})

describe('parseAutoApproveDomains', () => {
  it('treats unset and empty as invite-only', () => {
    expect(parseAutoApproveDomains(undefined)).toEqual([])
    expect(parseAutoApproveDomains('')).toEqual([])
    expect(parseAutoApproveDomains('   ')).toEqual([])
  })

  it('splits, trims, lowercases and drops a leading @', () => {
    expect(parseAutoApproveDomains('MonashMSS.com, @monashclubs.org')).toEqual([
      'monashmss.com',
      'monashclubs.org',
    ])
  })

  it('drops entries that are not domains, so a typo cannot widen access', () => {
    expect(parseAutoApproveDomains('monashmss.com,,localhost, .')).toEqual(['monashmss.com'])
  })
})

describe('emailMatchesAutoApprovedDomain', () => {
  const domains = ['monashmss.com', 'monashclubs.org']

  it('matches on the domain, case-insensitively', () => {
    expect(emailMatchesAutoApprovedDomain('Someone@MonashMSS.com', domains)).toBe(true)
    expect(emailMatchesAutoApprovedDomain('mmss@monashclubs.org', domains)).toBe(true)
  })

  it('rejects an unrelated domain', () => {
    expect(emailMatchesAutoApprovedDomain('someone@gmail.com', domains)).toBe(false)
  })

  it('grants nobody when no domains are configured', () => {
    expect(emailMatchesAutoApprovedDomain('someone@monashmss.com', [])).toBe(false)
  })

  it('does not match an approved domain hidden in the local part', () => {
    expect(emailMatchesAutoApprovedDomain('monashmss.com@evil.com', domains)).toBe(false)
    expect(emailMatchesAutoApprovedDomain('attacker+monashmss.com@evil.com', domains)).toBe(false)
  })

  it('reads a double-@ address as its real, final domain', () => {
    expect(emailMatchesAutoApprovedDomain('victim@monashmss.com@evil.com', domains)).toBe(false)
    expect(emailMatchesAutoApprovedDomain('victim@evil.com@monashmss.com', domains)).toBe(true)
  })

  it('rejects a subdomain of an approved domain', () => {
    expect(emailMatchesAutoApprovedDomain('someone@mail.monashmss.com', domains)).toBe(false)
  })

  it('rejects a malformed address with no local part', () => {
    expect(emailMatchesAutoApprovedDomain('@monashmss.com', domains)).toBe(false)
  })
})

describe('safeAdminRedirectPath', () => {
  it('keeps an admin path', () => {
    expect(safeAdminRedirectPath('/admin/submissions')).toBe('/admin/submissions')
    expect(safeAdminRedirectPath('/admin')).toBe('/admin')
  })

  it('falls back when nothing was asked for', () => {
    expect(safeAdminRedirectPath(null)).toBe('/admin/jobs')
    expect(safeAdminRedirectPath(undefined)).toBe('/admin/jobs')
    expect(safeAdminRedirectPath('')).toBe('/admin/jobs')
  })

  it('refuses an off-site redirect', () => {
    expect(safeAdminRedirectPath('https://evil.com')).toBe('/admin/jobs')
    expect(safeAdminRedirectPath('//evil.com')).toBe('/admin/jobs')
    expect(safeAdminRedirectPath('/\\evil.com')).toBe('/admin/jobs')
  })

  it('refuses a path outside the admin area', () => {
    expect(safeAdminRedirectPath('/submit')).toBe('/admin/jobs')
    expect(safeAdminRedirectPath('/')).toBe('/admin/jobs')
  })

  it('does not let a prefix match escape the admin area', () => {
    expect(safeAdminRedirectPath('/administrator-of-evil')).toBe('/admin/jobs')
  })
})
