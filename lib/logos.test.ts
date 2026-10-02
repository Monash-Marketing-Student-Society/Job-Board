import { describe, it, expect } from 'vitest'
import { BRANDFETCH_CLIENT_ID, brandfetchLogoUrl, normaliseDomain, sourceLogoUrl } from './logos'

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
