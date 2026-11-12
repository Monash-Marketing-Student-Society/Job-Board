/**
 * Location gate: does a posting's location string put it in Melbourne or
 * Sydney metro.
 *
 * Changed 7 Nov 2026: a string that names no Australian place at all is now
 * 'other', not 'unknown' -- global employers' career sites (Unilever,
 * Uniqlo) list roles in every country, and those went to review.
 *
 * Cheapest of the three targeting gates and run first (see target.ts), so a
 * Brisbane or Auckland posting is rejected before either the level or
 * function gate does any work. Matches against a data list of names and
 * suburbs plus postcode ranges, never a guess -- a location this can't place
 * resolves to 'unknown', not 'other', because 'other' means "rejected" and a
 * role that might genuinely be Melbourne or Sydney must never be dropped on
 * a guess. 'unknown' goes to review instead (see target.ts).
 */

import { matchesAny } from './text-match'
import { AUSTRALIA_SIGNALS, COUNTRIES, NAMESAKE_REGIONS, PLACELESS, WORLD_CITIES } from './places'
import { MELBOURNE_METRO_SUBURBS, OUTSIDE_METRO } from './melbourne-suburbs'

export type CityResolution = 'melbourne' | 'sydney' | 'other' | 'unknown'

// 'mel'/'melb' and 'syd': ANZ lists its 2028 Graduate Program as "Mel, Syd,
// Adel, Brisb, Perth, AU" -- without them it read as Perth and was rejected.
const MELBOURNE_ALIASES = ['melbourne', 'naarm', 'mel', 'melb']
const SYDNEY_ALIASES = ['sydney', 'syd']

const SYDNEY_SUBURBS = [
  'north sydney', 'chatswood', 'parramatta', 'macquarie park', 'ryde', 'bondi',
  'manly', 'surry hills', 'pyrmont', 'ultimo', 'darlinghurst', 'redfern',
  'alexandria', 'zetland', 'mascot', 'rosebery', 'st leonards', 'crows nest',
  'neutral bay', 'milsons point', 'barangaroo', 'the rocks', 'haymarket',
  'chippendale', 'newtown', 'marrickville', 'bankstown', 'liverpool', 'penrith',
  'blacktown', 'hornsby', 'epping', 'castle hill', 'baulkham hills',
  'olympic park', 'homebush',
  // Seen in synced postings since (Nov 2026).
  'artarmon', 'ashfield', 'asquith', 'balmain', 'bella vista', 'belrose', 'burwood', 'cabarita', 'camperdown',
  'caringbah', 'caringbah south', 'cecil park', 'chipping norton', 'concord', 'concord west', 'cremorne',
  'cronulla', 'eveleigh', 'frenchs forest', 'lidcombe', 'millers point', 'mona vale', 'moore park',
  'mount pritchard', 'merrylands', 'newington', 'north rocks', 'north ryde', 'north strathfield', 'rhodes',
  'rockdale', 'rooty hill', 'rydalmere', 'silverwater', 'strathfield', 'westmead', 'wetherill park',
  'wolli creek', 'campbelltown',
]

// Metropolitan Melbourne's postcodes, to the same line as melbourne-suburbs.ts:
// 3000-3207 (CBD to Port Melbourne), Sunbury, South Morang-Mernda-Doreen,
// Endeavour Hills-Pakenham, Langwarrin, Lynbrook-Cranbourne.
const MELBOURNE_POSTCODES: Array<[number, number]> = [
  [3000, 3207], [3427, 3429], [3752, 3754], [3802, 3810], [3910, 3910], [3975, 3978],
]
const VICTORIA_SIGNALS = ['vic', 'vict', 'victoria']
const NSW_SIGNALS = ['nsw', 'new south wales']
// Words left once state, country and placeless words are taken out: none
// means the string named no town ("Victoria", "VIC - other").
const NOT_A_PLACE = [...AUSTRALIA_SIGNALS, ...VICTORIA_SIGNALS, ...PLACELESS, 'area', 'greater', 'office']
const SYDNEY_POSTCODES: Array<[number, number]> = [[2000, 2249], [2555, 2770]]

// Unambiguous non-Melbourne, non-Sydney signals. Kept short and specific
// rather than broad, for the same reason the suburb lists are non-exhaustive
// in the other direction: a false 'other' here rejects a job outright, so
// only names unlikely to appear in any other context go in.
// Short state codes ('wa', 'sa', 'nt') are risky as bare tokens in most text,
// but a location field is a short address-like string, not prose -- the
// isolated-word risk that rules out something like ' us ' below doesn't apply
// the same way here.
const OTHER_AU_PLACE_SIGNALS = [
  'brisbane', 'gold coast', 'sunshine coast', 'cairns', 'townsville',
  'perth', 'adelaide', 'canberra', 'hobart', 'darwin',
  'newcastle', 'wollongong', 'geelong', 'ballarat', 'bendigo', 'central coast', 'wyong', 'gosford',
  'queensland', 'qld', 'western australia', 'wa', 'south australia', 'sa',
  'tasmania', 'tas', 'northern territory', 'nt',
]
// 'act' (Australian Capital Territory) deliberately excluded as a bare token
// -- unlike the other state codes, "act" is an ordinary English word, and
// 'canberra' above already catches the practical case.

// 'us' deliberately excluded -- too common an English word to use as a
// signal even with word boundaries ("Contact us" in a location field would
// false-positive). 'united states' and 'usa' cover the unambiguous cases.
const OVERSEAS_SIGNALS = [
  'united kingdom', 'uk', 'london', 'england', 'scotland', 'wales',
  'united states', 'usa', 'new zealand', 'nz',
  'singapore', 'india', 'philippines', 'malaysia', 'indonesia', 'china', 'japan',
  // ANZ writes "City, CC": "Quezon City, PH" otherwise resolved to unknown.
  'ph', 'manila', 'quezon city',
]

function extractPostcodes(text: string): number[] {
  const matches = text.match(/\b\d{4}\b/g)
  return matches ? matches.map(Number) : []
}

function matchesPostcode(text: string, ranges: Array<[number, number]>): boolean {
  const postcodes = extractPostcodes(text)
  return postcodes.some((pc) => ranges.some(([lo, hi]) => pc >= lo && pc <= hi))
}

function namesATown(text: string): boolean {
  let rest = text
  for (const word of NOT_A_PLACE) {
    rest = rest.replace(new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), ' ')
  }
  return /[a-z]{3,}/.test(rest.replace(/[^a-z]+/g, ' '))
}

export function resolveCity(locationText: string | null | undefined): CityResolution {
  if (!locationText || !locationText.trim()) return 'unknown'
  const text = locationText.toLowerCase()

  // Postcode decides before a suburb name does, not after: a postcode is
  // unambiguous where a name isn't -- Cremorne is both an inner-Melbourne
  // suburb and a Sydney North Shore one, and "Cremorne, NSW 2090" should
  // resolve on the 2090, not on the name matching Melbourne's list first.
  //
  // No special case for "remote" needed anywhere in this function: "Remote -
  // Australia" carries no Melbourne/Sydney/other-place signal at all, so it
  // already falls through to 'unknown' below -- exactly the "no office
  // attached" behaviour this gate needs. "Remote, Melbourne" and "Remote -
  // WA" are still caught by the checks below, since the word "remote" itself
  // never blocks a place check from running.
  if (matchesPostcode(text, MELBOURNE_POSTCODES)) return 'melbourne'
  if (matchesPostcode(text, SYDNEY_POSTCODES)) return 'sydney'

  // Overseas roles are never wanted (7 Nov 2026). "Melbourne, FL, USA" is the
  // namesake, not ours -- unless the string also names Australia, as a
  // multi-country listing does.
  const australian = matchesAny(text, AUSTRALIA_SIGNALS)
  if (!australian && matchesAny(text, NAMESAKE_REGIONS)) return 'other'

  // Order doesn't affect correctness for a multi-city posting -- either match
  // returns a non-reject, non-unknown result, which is all `targets()` reads
  // off this. Melbourne checked first purely for determinism, and only
  // matters at all for an unqualified same-name collision like bare
  // "Cremorne" (no postcode to break the tie either way).
  // The state decides which city's suburbs a name can be: Burwood,
  // Richmond, Croydon and Carlton are suburbs of both.
  const victoria = matchesAny(text, VICTORIA_SIGNALS)
  const nsw = matchesAny(text, NSW_SIGNALS)
  if (matchesAny(text, MELBOURNE_ALIASES)) return 'melbourne'
  if (victoria && matchesAny(text, OUTSIDE_METRO)) return 'other'
  if ((!nsw || victoria) && matchesAny(text, MELBOURNE_METRO_SUBURBS)) return 'melbourne'
  if ((!victoria || nsw) && (matchesAny(text, SYDNEY_ALIASES) || matchesAny(text, SYDNEY_SUBURBS))) return 'sydney'
  if (matchesAny(text, OTHER_AU_PLACE_SIGNALS)) return 'other'
  // "New South Wales" is not Wales: an unlisted Sydney suburb read as
  // overseas before this was taken out.
  const abroad = text.replace(/new south wales/g, ' ')
  if (matchesAny(abroad, OVERSEAS_SIGNALS) || matchesAny(abroad, COUNTRIES) || matchesAny(abroad, WORLD_CITIES)) return 'other'

  // Melbourne only means metropolitan Melbourne (12 Nov 2026): a Victorian
  // town outside it -- Wodonga, Cowes, Mornington -- is too far to commute
  // to from Monash. A string naming no town at all still goes to review.
  if (victoria && !nsw && namesATown(text)) return 'other'

  // Nothing placed it. "Remote", "National" or a string that names Australia
  // could still be Melbourne or Sydney, so it goes to review. A place name
  // with nothing Australian about it ("Cuenca", "Lyon") is somewhere else:
  // the career sites of global employers list every country's roles.
  if (australian || matchesAny(text, PLACELESS)) return 'unknown'
  return 'other'
}
