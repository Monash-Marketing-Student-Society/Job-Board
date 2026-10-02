import { describe, it, expect } from 'vitest'
import {
  BRAND_SEARCH_MAX,
  BRANDFETCH_CLIENT_ID,
  autoMatch,
  brandSearchUrl,
  brandfetchLogoUrl,
  comparableName,
  normaliseDomain,
  parseBrandSearch,
  parseBrandfetchInput,
  parseLogoInput,
  sourceLogoUrl,
} from './logos'

describe('normaliseDomain', () => {
  it('accepts a bare domain, a URL, or a www. host and returns the bare hostname', () => {
    expect(normaliseDomain('mars.com')).toBe('mars.com')
    expect(normaliseDomain('https://www.commbank.com.au/careers?x=1')).toBe('commbank.com.au')
    expect(normaliseDomain('  WWW.Ogilvy.com  ')).toBe('ogilvy.com')
  })

  it('rejects things that are not a public domain', () => {
    for (const bad of [null, undefined, '', '   ', 'localhost', '127.0.0.1', 'not a domain', 'mars']) {
      expect(normaliseDomain(bad)).toBeNull()
    }
  })
})

describe('brandfetchLogoUrl', () => {
  it('builds a hotlinkable 128px icon URL with a lettermark fallback and our client id', () => {
    expect(brandfetchLogoUrl('https://www.pg.com/')).toBe(
      `https://cdn.brandfetch.io/domain/pg.com/w/128/h/128/fallback/lettermark/icon?c=${BRANDFETCH_CLIENT_ID}`
    )
  })

  it('returns null rather than a URL for an unusable domain', () => {
    expect(brandfetchLogoUrl('localhost')).toBeNull()
    expect(brandfetchLogoUrl(null)).toBeNull()
  })
})

describe('sourceLogoUrl', () => {
  it('reads config.domain', () => {
    expect(sourceLogoUrl({ vendor: 'workday', domain: 'mars.com' })).toContain('/domain/mars.com/')
  })

  it('is null for a source without a usable domain', () => {
    expect(sourceLogoUrl({})).toBeNull()
    expect(sourceLogoUrl(null)).toBeNull()
    expect(sourceLogoUrl({ domain: 42 })).toBeNull()
  })
})

const result = (name: string, domain: string, verified: boolean | undefined, qualityScore: number) => ({
  brandId: 'x',
  name,
  domain,
  verified,
  qualityScore,
  icon: 'https://cdn.brandfetch.io/x/icon.webp',
})

describe('brandSearchUrl', () => {
  it('encodes the trimmed company name and carries the client id', () => {
    expect(brandSearchUrl('  P&G Australia ')).toBe(
      `https://api.brandfetch.io/v2/search/P%26G%20Australia?c=${BRANDFETCH_CLIENT_ID}`
    )
  })
})

describe('parseBrandSearch', () => {
  it('keeps name, domain, verified and quality, capped at BRAND_SEARCH_MAX', () => {
    const rows = Array.from({ length: 6 }, (_, i) => result(`Co ${i}`, `co${i}.com`, true, 0.9))
    const parsed = parseBrandSearch(rows)
    expect(parsed).toHaveLength(BRAND_SEARCH_MAX)
    expect(parsed[0]).toEqual({ name: 'Co 0', domain: 'co0.com', verified: true, quality: 0.9 })
  })

  it('drops junk rows, unusable domains and duplicate domains', () => {
    expect(
      parseBrandSearch([null, 'x', { name: 'No domain' }, result('Bad', 'localhost', true, 1), result('A', 'a.com', true, 1), result('A again', 'www.a.com', true, 1)])
    ).toEqual([{ name: 'A', domain: 'a.com', verified: true, quality: 1 }])
  })

  it('treats a non-array response (an error body) as no matches', () => {
    expect(parseBrandSearch({ message: 'Unauthorized' })).toEqual([])
  })
})

describe('comparableName', () => {
  it('ignores case, punctuation, & vs and, and legal suffixes', () => {
    expect(comparableName('Mars, Inc.')).toBe('mars')
    expect(comparableName('Bain & Company')).toBe(comparableName('bain and company'))
    expect(comparableName('Acme Pty Ltd')).toBe('acme')
  })
})

describe('autoMatch', () => {
  // Shapes taken from live Brand Search responses on 2 Oct 2026.
  const ogilvy = parseBrandSearch([result('Ogilvy', 'ogilvy.com', true, 1), result('Ogilvy', 'ogilvypr.com', undefined, 0.54)])
  const bain = parseBrandSearch([
    result('Bain & Company', 'bain.com', true, 1),
    result('Bain Capital Ventures', 'baincapitalventures.com', true, 0.92),
  ])
  const commbank = parseBrandSearch([
    result('Commonwealth Bank of Australia', 'commbank.com.au', true, 0.92),
    result('First Commonwealth', 'firstcomcu.org', true, 0.86),
  ])

  it('picks the single verified exact-name brand', () => {
    expect(autoMatch('ogilvy', ogilvy)?.domain).toBe('ogilvy.com')
  })

  it('does not guess when the typed name is not an exact match', () => {
    expect(autoMatch('Bain', bain)).toBeNull()
    expect(autoMatch('Commonwealth Bank', commbank)).toBeNull()
  })

  it('does not guess between two verified brands with the same name', () => {
    expect(autoMatch('Acme', parseBrandSearch([result('Acme', 'acme.com', true, 1), result('ACME', 'acme.com.au', true, 1)]))).toBeNull()
  })

  it('needs verified and good quality', () => {
    expect(autoMatch('Acme', parseBrandSearch([result('Acme', 'acme.com', false, 1)]))).toBeNull()
    expect(autoMatch('Acme', parseBrandSearch([result('Acme', 'acme.com', true, 0.6)]))).toBeNull()
  })

  it('is null for an empty name', () => {
    expect(autoMatch('  ', ogilvy)).toBeNull()
  })
})

describe('parseBrandfetchInput', () => {
  const byDomain = (d: string) => ({ logoUrl: brandfetchLogoUrl(d), domain: d })

  it('takes a bare domain', () => {
    expect(parseBrandfetchInput(' ogilvy.com ')).toEqual(byDomain('ogilvy.com'))
  })

  it('takes a Brandfetch brand page', () => {
    expect(parseBrandfetchInput('https://brandfetch.com/www.commbank.com.au?view=logos')).toEqual(byDomain('commbank.com.au'))
  })

  it('takes Logo API links by domain, with or without the /domain/ prefix, and drops their client id', () => {
    expect(parseBrandfetchInput('https://cdn.brandfetch.io/ogilvy.com/w/400?c=someoneelse')).toEqual(byDomain('ogilvy.com'))
    expect(parseBrandfetchInput('https://cdn.brandfetch.io/domain/pg.com/fallback/404?c=x')).toEqual(byDomain('pg.com'))
  })

  it('keeps a copied asset link as that file, with our client id in place of theirs', () => {
    expect(
      parseBrandfetchInput('https://cdn.brandfetch.io/id-0D6OFrq/theme/dark/idGIofJnQn.svg?c=1bxid64Mup7aczewSAYMX&t=1740370812106')
    ).toEqual({
      logoUrl: `https://cdn.brandfetch.io/id-0D6OFrq/theme/dark/idGIofJnQn.svg?c=${BRANDFETCH_CLIENT_ID}`,
      domain: null,
    })
  })

  it('rejects anything that is not a Brandfetch logo', () => {
    for (const bad of [
      '',
      'not a link',
      'https://media.licdn.com/dms/image/v2/logo.png',
      'https://evil.example/cdn.brandfetch.io/ogilvy.com',
      'https://brandfetch.com/',
      'https://cdn.brandfetch.io/',
      'https://cdn.brandfetch.io/<script>/x',
      'ogilvy.com/path',
      'javascript:alert(1)',
    ]) {
      expect(parseBrandfetchInput(bad)).toBeNull()
    }
  })
})

describe('parseLogoInput', () => {
  const NOW = new Date('2026-10-02T03:00:00Z')
  const LINKEDIN =
    'https://media.licdn.com/dms/image/v2/D560BAQHsq-9WUnexGg/company-logo_200_200/company-logo_200_200/0/1714699432894/talaria_asset_management_logo?e=2147483647&v=beta&t=abc'
  const INSTAGRAM_7_OCT = 'https://instagram.fmel17-1.fna.fbcdn.net/v/t51.2885-19/1_n.jpg?_nc_ht=x&oe=6AC4FDD4&_nc_sid=10d13b'

  it('still takes every Brandfetch form, with no expiry', () => {
    expect(parseLogoInput('ogilvy.com', NOW)).toEqual({
      ok: true,
      logo: { logoUrl: brandfetchLogoUrl('ogilvy.com'), domain: 'ogilvy.com', expiresAt: null },
    })
  })

  it('takes a long-lived LinkedIn logo link as-is, with its expiry', () => {
    const result = parseLogoInput(LINKEDIN, NOW)
    expect(result).toMatchObject({ ok: true, logo: { logoUrl: LINKEDIN, domain: null } })
    expect(result.ok && result.logo.expiresAt?.getUTCFullYear()).toBe(2038)
  })

  it('takes an image link with no expiry, e.g. Google Play or our own bucket', () => {
    for (const link of [
      'https://play-lh.googleusercontent.com/AZEIGHgTZc-T2LXJ6N4GeiA9GSMbQI_SYS4WZ1kew58',
      'https://olyzdpqfecawcueffrsq.supabase.co/storage/v1/object/public/company-logos/a.png',
    ]) {
      expect(parseLogoInput(link, NOW)).toMatchObject({ ok: true, logo: { logoUrl: link, expiresAt: null } })
    }
  })

  it('refuses a signed link that expires within 30 days, naming the date', () => {
    const result = parseLogoInput(INSTAGRAM_7_OCT, NOW)
    expect(result.ok).toBe(false)
    expect(!result.ok && result.reason).toMatch(/expires on 7 Oct 2026.*upload/)
  })

  it('refuses an already-expired LinkedIn link', () => {
    const result = parseLogoInput('https://media.licdn.com/dms/image/x/logo?e=1775088000&v=beta', NOW)
    expect(!result.ok && result.reason).toMatch(/expired on/)
  })

  it('refuses pages, plain http, and junk', () => {
    for (const bad of [
      'https://www.facebook.com/melbournesocialco',
      'https://au.linkedin.com/company/mcmpr',
      'https://www.instagram.com/mangocomms/',
      'http://example.com/logo.png',
      'javascript:alert(1)',
      'not a link',
      'https://brandfetch.com/',
    ]) {
      expect(parseLogoInput(bad, NOW).ok).toBe(false)
    }
  })
})
