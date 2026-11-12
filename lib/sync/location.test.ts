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

  // Since 12 Nov 2026 the state qualifier decides: "Cremorne, NSW" is
  // Sydney's. A bare name still reads as Melbourne (checked first).
  it('disambiguates a suburb name that exists in both cities by its state', () => {
    expect(resolveCity('Cremorne')).toBe('melbourne')
    expect(resolveCity('Cremorne, NSW')).toBe('sydney')
    expect(resolveCity('Cremorne, NSW 2090')).toBe('sydney') // the postcode does resolve it
  })

  it('resolves Melbourne by postcode', () => {
    expect(resolveCity('VIC 3000')).toBe('melbourne')
    expect(resolveCity('3207')).toBe('melbourne')
    expect(resolveCity('3211')).not.toBe('melbourne') // Little River: past the metropolitan line
  })

  it('resolves Sydney by postcode, including the second range', () => {
    expect(resolveCity('2000')).toBe('sydney')
    expect(resolveCity('2600')).toBe('sydney') // inside 2555-2770, outside 2000-2249
  })

  it('does not match a postcode just outside the Sydney ranges', () => {
    expect(resolveCity('2300')).not.toMatch(/melbourne|sydney/) // between the two Sydney ranges
    expect(resolveCity('2800')).not.toMatch(/melbourne|sydney/) // above both Sydney ranges
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
    expect(resolveCity('Kewell Street warehouse')).not.toBe('melbourne')
  })
})

describe('resolveCity: ANZ location strings (careers.anz.com, 2 Oct 2026)', () => {
  it('reads Mel and Syd abbreviations as Melbourne and Sydney', () => {
    expect(resolveCity('Mel, Syd, Adel, Brisb, Perth, AU')).toBe('melbourne')
    expect(resolveCity('Syd, AU')).toBe('sydney')
  })

  it('reads a Philippines country code as overseas', () => {
    expect(resolveCity('Quezon City, PH')).toBe('other')
    expect(resolveCity('Manila')).toBe('other')
  })

  it('still reads other cities as other, and plain Melbourne as Melbourne', () => {
    expect(resolveCity('Auckland, NZ')).toBe('other')
    expect(resolveCity('Melbourne, Sydney, Brisbane, AU')).toBe('melbourne')
  })
})


// 7 Nov 2026: overseas roles from global career sites must never reach review.
describe('resolveCity: overseas postings', () => {
  it('removes a posting in another country', () => {
    expect(resolveCity('Guayaquil, Ecuador')).toBe('other')
    expect(resolveCity('Frankfurt, Germany')).toBe('other')
    expect(resolveCity('Paris')).toBe('other')
    expect(resolveCity('Cuenca')).toBe('other')
  })

  it('removes the namesake Melbourne and Sydney', () => {
    expect(resolveCity('Melbourne, FL, USA')).toBe('other')
    expect(resolveCity('Sydney, Nova Scotia, Canada')).toBe('other')
  })

  it('keeps a multi-country listing that includes Melbourne or Sydney', () => {
    expect(resolveCity('Auckland, New Zealand; Brisbane, Australia; Melbourne, Australia')).toBe('melbourne')
    expect(resolveCity('Melbourne, Auckland')).toBe('melbourne')
  })

  it('sends placeless or Australia-only strings to review', () => {
    for (const loc of ['National', 'Various Locations', 'Remote - Australia', 'NSW - other', 'Australia']) {
      expect(resolveCity(loc)).toBe('unknown')
    }
  })

  it('still reads the career-site strings seen so far', () => {
    expect(resolveCity('SYDNEY GO')).toBe('sydney')
    expect(resolveCity('Freshwater Place, VIC,AU, AU')).not.toBe('other')
    expect(resolveCity('Hawthorn')).toBe('melbourne')
    expect(resolveCity('Melbourne - CBD & Inner, VIC, AU')).toBe('melbourne')
  })
})

// 12 Nov 2026: Melbourne means metropolitan Melbourne -- within commuting
// distance of Monash. Every Victorian string the sync had seen, by outcome.
describe('resolveCity: metropolitan Melbourne only', () => {
  it('keeps metropolitan suburbs, inner to outer', () => {
    for (const loc of [
      'Clayton, Victoria', 'Mount Waverley, Victoria', 'Bulleen, Victoria', 'Tullamarine, Victoria', 'Bayswater, Victoria',
      'Derrimut, Victoria', 'Rowville, Victoria', 'Lilydale, Victoria', 'Officer, Victoria', 'Truganina, Victoria',
      'Werribee, Victoria', 'Somerton, Victoria', 'Knoxfield, Victoria', 'Freshwater Place, VIC,AU, AU',
      'VIC - SBK HWT Tower 40 City Road Southbank', 'Hawthorn East   Melbourne, Victoria, Australia', 'Greater Melbourne Area',
      'Support Office - Docklands, VIC, AU', 'Windsor, Melbourne', 'Frankston VIC 3199', 'Pakenham VIC 3810',
    ]) {
      expect(resolveCity(loc), loc).toBe('melbourne')
    }
  })

  it('removes Victorian towns outside it', () => {
    for (const loc of [
      'Geelong, Victoria', 'South Geelong, Victoria', 'Corio, Victoria', 'Ballarat, Victoria', 'Wodonga, Victoria',
      'Cowes, Victoria', 'Mornington, Victoria', 'Coldstream, VIC, Australia', 'Pakenham Upper, Victoria',
      'Horsham, Mildura & Surrounds, Vict, AU', 'Regional Victoria',
    ]) {
      expect(resolveCity(loc), loc).toBe('other')
    }
  })

  it('sends a Victorian string naming no town to review', () => {
    expect(resolveCity('Victoria, Australia')).toBe('unknown')
    expect(resolveCity('VIC - other')).toBe('unknown')
  })

  it('reads a suburb name both cities share by its state', () => {
    expect(resolveCity('Burwood, Victoria')).toBe('melbourne')
    expect(resolveCity('Burwood, New South Wales')).toBe('sydney')
    expect(resolveCity('Richmond, New South Wales')).not.toBe('melbourne')
    expect(resolveCity('Sydney CBD Area')).toBe('sydney')
  })

  it('reads an unlisted Sydney suburb as Australian, not as Wales', () => {
    expect(resolveCity('Artarmon, New South Wales')).toBe('sydney')
    expect(resolveCity('Kogarah, New South Wales')).toBe('unknown')
    expect(resolveCity('Central Coast, New South Wales')).toBe('other')
  })
})
