/**
 * What the LinkedIn source searches for, and how much it may spend.
 *
 * Every search input costs Bright Data records -- up to `LIMIT_PER_INPUT`
 * each -- so this list IS the budget. The free plan gives 5,000 records a
 * month; `MONTHLY_RECORD_CAP` stops short of it, and the adapter refuses a
 * run whose worst case would cross the cap (lib/sync/adapters/linkedin.ts).
 *
 * Worst case: 24 inputs x 16 = 384 records a run; two runs a week (about
 * 8.7 a month) is ~3,340, under the cap. In practice it's below that,
 * because `jobs_to_not_include` skips every posting already bought and
 * "Past week" overlaps between the Monday and Thursday runs.
 *
 * The level lives in the keyword, not in a filter. Measured live on
 * 3 Oct 2026, 24 records each, through the real targeting gates:
 *   - broad keywords ("marketing", "brand") x experience_level
 *     Internship / Entry level, selective_search on: 0 of 20 passed. The
 *     Internship and Entry level inputs returned the SAME postings --
 *     experience_level is ignored -- and nearly all were Manager/Lead roles.
 *   - the same with selective_search off: 4 of 24 passed, still duplicated.
 *   - the junior-phrased keywords below, no level, selective_search off:
 *     19 of 24 passed (16 unique postings).
 * job_type is left out too: "Part-time"/"Contract" inputs returned only
 * error records (`job_type mismatch: requested "Part-time", got
 * "Full-time"`), because Bright Data checks it after the search instead of
 * filtering by it. Part-time roles still arrive through these searches.
 *
 * To change a search, edit KEYWORDS. Each keyword is 2 inputs (one per
 * city), about 280 records a month at worst -- lower LIMIT_PER_INPUT or
 * check the arithmetic against the cap before adding one.
 */

/** One search, exactly as the Bright Data dataset takes it. */
export interface LinkedInSearchInput {
  keyword: string
  location: string
  country: 'AU'
  time_range: 'Past 24 hours' | 'Past week' | 'Past month' | 'Any time'
  selective_search: boolean
  jobs_to_not_include?: string[]
}

export const KEYWORDS = [
  'marketing intern',
  'marketing internship',
  'marketing graduate',
  'graduate program marketing',
  'marketing assistant',
  'marketing coordinator',
  'junior marketing',
  'brand assistant',
  'social media coordinator',
  'communications assistant',
  'digital marketing assistant',
  'marketing associate',
]

export const LOCATIONS = ['Melbourne', 'Sydney']

export const LIMIT_PER_INPUT = 16
export const MONTHLY_RECORD_CAP = 4000

/** How many already-held posting ids to pass as `jobs_to_not_include` per input. */
export const MAX_EXCLUDED_IDS = 200

/** Every search input for one run, before `jobs_to_not_include` is filled in. */
export function searchInputs(): LinkedInSearchInput[] {
  // selective_search off: on, it returned mostly senior roles (see above).
  const base = { country: 'AU', time_range: 'Past week', selective_search: false } as const
  return KEYWORDS.flatMap((keyword) => LOCATIONS.map((location) => ({ ...base, keyword, location })))
}
