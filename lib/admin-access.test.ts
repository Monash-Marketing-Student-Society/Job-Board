import { describe, it, expect } from 'vitest'
import {
  normalizeEmail,
  parseAutoApproveDomains,
  emailMatchesAutoApprovedDomain,
  safeAdminRedirectPath,
  ensureAdminAccess,
  RECOVERY_ADMIN_FALLBACK,
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

/**
 * Minimal stand-in for the service-role client, covering only the calls
 * ensureAdminAccess makes. Enough to pin the grant rules, which are the part
 * of this module that decides who gets into the dashboard.
 */
function fakeClient(opts: {
  adminRow?: { is_admin: boolean } | null
  invite?: { id: string } | null
  recovery?: string | null
}) {
  const upserts: Record<string, unknown>[] = []
  const client = {
    from(table: string) {
      const chain = {
        select: () => chain,
        eq: () => chain,
        is: () => Promise.resolve({ data: null, error: null }),
        update: () => chain,
        maybeSingle: () => {
          if (table === 'admin_users') return Promise.resolve({ data: opts.adminRow ?? null })
          if (table === 'admin_invites') return Promise.resolve({ data: opts.invite ?? null })
          if (table === 'admin_settings') {
            return Promise.resolve({
              data: opts.recovery === undefined ? { value: null } : { value: opts.recovery },
            })
          }
          return Promise.resolve({ data: null })
        },
        upsert: (row: Record<string, unknown>) => {
          upserts.push(row)
          return Promise.resolve({ error: null })
        },
      }
      return chain
    },
  }
  return { client, upserts }
}

const user = (email: string, confirmed = true) => ({
  id: 'user-1',
  email,
  // undefined, not null: that is how supabase-js types an unconfirmed address.
  email_confirmed_at: confirmed ? '2026-01-01T00:00:00Z' : undefined,
})

describe('ensureAdminAccess: the recovery admin', () => {
  it('is granted with no invitation and no approved domain', async () => {
    const { client, upserts } = fakeClient({ recovery: 'mmss@monashclubs.org' })
    const result = await ensureAdminAccess(client as never, user('mmss@monashclubs.org'))
    expect(result).toEqual({ granted: true, reason: 'recovery' })
    expect(upserts).toEqual([{ id: 'user-1', is_admin: true }])
  })

  it('is matched case-insensitively, so a typed capital does not lock the club out', async () => {
    const { client } = fakeClient({ recovery: 'mmss@monashclubs.org' })
    const result = await ensureAdminAccess(client as never, user('MMSS@MonashClubs.org'))
    expect(result.granted).toBe(true)
  })

  it('is granted even when the address is unconfirmed', async () => {
    // The emergency path cannot depend on a confirmation email arriving.
    const { client } = fakeClient({ recovery: 'mmss@monashclubs.org' })
    const result = await ensureAdminAccess(client as never, user('mmss@monashclubs.org', false))
    expect(result.granted).toBe(true)
  })

  it('falls back to a constant when the setting row is empty', async () => {
    const { client } = fakeClient({ recovery: null })
    const result = await ensureAdminAccess(client as never, user(RECOVERY_ADMIN_FALLBACK))
    expect(result).toEqual({ granted: true, reason: 'recovery' })
  })

  it('does not let a different address in', async () => {
    const { client, upserts } = fakeClient({ recovery: 'mmss@monashclubs.org' })
    const result = await ensureAdminAccess(client as never, user('someone@gmail.com'))
    expect(result).toEqual({ granted: false, reason: 'not-invited' })
    expect(upserts).toEqual([])
  })

  it('reports an existing grant as existing, not recovery', async () => {
    const { client } = fakeClient({
      adminRow: { is_admin: true },
      recovery: 'mmss@monashclubs.org',
    })
    const result = await ensureAdminAccess(client as never, user('mmss@monashclubs.org'))
    expect(result).toEqual({ granted: true, reason: 'existing' })
  })
})
