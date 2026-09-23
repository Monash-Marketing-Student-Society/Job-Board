/**
 * Location gate: does a posting's location string put it in Melbourne or
 * Sydney metro.
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

export type CityResolution = 'melbourne' | 'sydney' | 'other' | 'unknown'

const MELBOURNE_ALIASES = ['melbourne', 'naarm']
const SYDNEY_ALIASES = ['sydney']

// Deliberately not exhaustive -- the postcode ranges below are the complete
// fallback for a suburb this list doesn't happen to name. This only needs to
// catch the suburbs an employer's own location string is likely to actually
// use.
const MELBOURNE_SUBURBS = [
  'docklands', 'southbank', 'south yarra', 'richmond', 'fitzroy', 'collingwood',
  'carlton', 'parkville', 'st kilda', 'prahran', 'windsor', 'toorak', 'hawthorn',
  'camberwell', 'box hill', 'glen waverley', 'mulgrave', 'notting hill', 'clayton',
  'dandenong', 'footscray', 'sunshine', 'essendon', 'brunswick', 'coburg',
  'preston', 'northcote', 'thornbury', 'ringwood', 'croydon', 'bundoora',
  'reservoir', 'werribee', 'point cook', 'cremorne', 'abbotsford', 'kew',
  'malvern', 'caulfield', 'bentleigh', 'moorabbin', 'cheltenham', 'mentone',
]

const SYDNEY_SUBURBS = [
  'north sydney', 'chatswood', 'parramatta', 'macquarie park', 'ryde', 'bondi',
  'manly', 'surry hills', 'pyrmont', 'ultimo', 'darlinghurst', 'redfern',
  'alexandria', 'zetland', 'mascot', 'rosebery', 'st leonards', 'crows nest',
  'neutral bay', 'milsons point', 'barangaroo', 'the rocks', 'haymarket',
  'chippendale', 'newtown', 'marrickville', 'bankstown', 'liverpool', 'penrith',
  'blacktown', 'hornsby', 'epping', 'castle hill', 'baulkham hills',
  'olympic park', 'homebush',
]

const MELBOURNE_POSTCODES: Array<[number, number]> = [[3000, 3211]]
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
  'newcastle', 'wollongong', 'geelong', 'ballarat', 'bendigo',
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
]

function extractPostcodes(text: string): number[] {
  const matches = text.match(/\b\d{4}\b/g)
  return matches ? matches.map(Number) : []
}

function matchesPostcode(text: string, ranges: Array<[number, number]>): boolean {
  const postcodes = extractPostcodes(text)
  return postcodes.some((pc) => ranges.some(([lo, hi]) => pc >= lo && pc <= hi))
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

  // Order doesn't affect correctness for a multi-city posting -- either match
  // returns a non-reject, non-unknown result, which is all `targets()` reads
  // off this. Melbourne checked first purely for determinism, and only
  // matters at all for an unqualified same-name collision like bare
  // "Cremorne" (no postcode to break the tie either way).
  if (matchesAny(text, MELBOURNE_ALIASES) || matchesAny(text, MELBOURNE_SUBURBS)) return 'melbourne'
  if (matchesAny(text, SYDNEY_ALIASES) || matchesAny(text, SYDNEY_SUBURBS)) return 'sydney'
  if (matchesAny(text, OTHER_AU_PLACE_SIGNALS) || matchesAny(text, OVERSEAS_SIGNALS)) return 'other'

  return 'unknown'
}
