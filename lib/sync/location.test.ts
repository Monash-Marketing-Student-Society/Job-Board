import { describe, it, expect } from 'vitest'
import { resolveCity } from './location'

describe('resolveCity', () => {
  it('resolves Melbourne by name', () => {
    expect(resolveCity('Melbourne, VIC')).toBe('melbourne')
    expect(resolveCity('Melbourne')).toBe('melbourne')
    expect(resolveCity('Naarm/Melbourne')).toBe('melbourne')
  })

  it('resolves Sydney by name', () => {
    expect(resolveCity('Sydney, NSW')).toBe('sydney')
  })

  it('resolves Melbourne by metro suburb', () => {
    expect(resolveCity('Docklands VIC 3008')).toBe('melbourne')
    expect(resolveCity('Richmond')).toBe('melbourne')
    expect(resolveCity('Cremorne, Victoria')).toBe('melbourne')
  })

  it('resolves Sydney by metro suburb', () => {
    expect(resolveCity('North Sydney NSW')).toBe('sydney')
    expect(resolveCity('Parramatta')).toBe('sydney')
  })

  // Sydney has both a Cremorne (a Sydney North Shore suburb) and Melbourne's
  // Cremorne (inner-city, near Richmond) -- a genuine same-name collision
  // between the two target cities. Not resolved here: the suburb lists don't
  // parse a state qualifier, so 'Cremorne' always reads as Melbourne
  // (checked first), even when "NSW" appears right next to it. Documented
  // rather than silently wrong -- a location string this ambiguous should
  // really carry a postcode too, which this gate would resolve correctly.
  it('cannot disambiguate a suburb name that exists in both cities, even with a state qualifier', () => {
    expect(resolveCity('Cremorne')).toBe('melbourne')
    expect(resolveCity('Cremorne, NSW')).toBe('melbourne')
    expect(resolveCity('Cremorne, NSW 2090')).toBe('sydney') // the postcode does resolve it
  })

  it('resolves Melbourne by postcode', () => {
    expect(resolveCity('VIC 3000')).toBe('melbourne')
    expect(resolveCity('3211')).toBe('melbourne')
  })

  it('resolves Sydney by postcode, including the second range', () => {
    expect(resolveCity('2000')).toBe('sydney')
    expect(resolveCity('2600')).toBe('sydney') // inside 2555-2770, outside 2000-2249
  })

  it('does not match a postcode just outside the Sydney ranges', () => {
    expect(resolveCity('2300')).toBe('unknown') // between the two Sydney ranges
    expect(resolveCity('2800')).toBe('unknown') // above both Sydney ranges
  })

  it('rejects an unambiguous other Australian city', () => {
    expect(resolveCity('Brisbane, QLD')).toBe('other')
    expect(resolveCity('Perth')).toBe('other')
    expect(resolveCity('Remote - WA')).toBe('other')
  })

  it('rejects an unambiguous overseas location', () => {
    expect(resolveCity('London, UK')).toBe('other')
    expect(resolveCity('Remote - United States')).toBe('other')
  })

  it('treats a plain "remote" with no city attached as unknown, not a match', () => {
    expect(resolveCity('Remote')).toBe('unknown')
    expect(resolveCity('Remote - Australia')).toBe('unknown')
  })

  it('resolves a remote role that still names an office city', () => {
    expect(resolveCity('Remote, Melbourne')).toBe('melbourne')
    expect(resolveCity('Hybrid - Sydney CBD')).toBe('sydney')
  })

  it('passes a multi-city posting on the first city match, never rejects it', () => {
    expect(resolveCity('Melbourne, Sydney, Brisbane')).not.toBe('other')
    expect(resolveCity('Melbourne, Sydney, Brisbane')).not.toBe('unknown')
  })

  it('returns unknown for empty, null or undefined input', () => {
    expect(resolveCity(null)).toBe('unknown')
    expect(resolveCity(undefined)).toBe('unknown')
    expect(resolveCity('')).toBe('unknown')
    expect(resolveCity('   ')).toBe('unknown')
  })

  it('returns unknown for a location string with no recognisable place at all', () => {
    expect(resolveCity('Flexible')).toBe('unknown')
    expect(resolveCity('Various locations')).toBe('unknown')
  })

  it('does not false-positive on a suburb name embedded in a longer word', () => {
    // "Kew" is a Melbourne suburb; "Kewpie" or similar should not match it.
    expect(resolveCity('Kewell Street warehouse')).toBe('unknown')
  })
})
