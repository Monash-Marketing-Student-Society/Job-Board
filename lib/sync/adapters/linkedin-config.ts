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
 * No job_type inputs (live test, 3 Oct 2026): a "Part-time" or "Contract"
 * search returned only error records -- `job_type mismatch: requested
 * "Part-time", got "Full-time"`, 5 of 5. Bright Data checks job_type after
 * the LinkedIn search rather than filtering it, so those inputs bought
 * nothing. Part-time and contract roles still arrive through the level
 * searches (an Internship search returned a Part-time intern role).
 *
 * To change a search, edit the lists below. Adding a keyword adds
 * 2 cities x 2 levels = 4 inputs, about 560 records a month at worst --
 * lower LIMIT_PER_INPUT or check the arithmetic against the cap first.
 */

/** One search, exactly as the Bright Data dataset takes it. */
export interface LinkedInSearchInput {
  keyword: string
  location: string
  country: 'AU'
  time_range: 'Past 24 hours' | 'Past week' | 'Past month' | 'Any time'
  experience_level?: 'Internship' | 'Entry level' | 'Associate'
  selective_search: boolean
  jobs_to_not_include?: string[]
}

export const KEYWORDS = [
  'marketing',
  'brand',
  'digital marketing',
  'social media',
  'communications',
  'marketing graduate program',
]

export const LOCATIONS = ['Melbourne', 'Sydney']

export const EXPERIENCE_LEVELS = ['Internship', 'Entry level'] as const

export const LIMIT_PER_INPUT = 16
export const MONTHLY_RECORD_CAP = 4000

/** How many already-held posting ids to pass as `jobs_to_not_include` per input. */
export const MAX_EXCLUDED_IDS = 200

/** Every search input for one run, before `jobs_to_not_include` is filled in. */
export function searchInputs(): LinkedInSearchInput[] {
  const base = { country: 'AU', time_range: 'Past week', selective_search: true } as const
  const inputs: LinkedInSearchInput[] = []
  for (const keyword of KEYWORDS) {
    for (const location of LOCATIONS) {
      for (const experience_level of EXPERIENCE_LEVELS) inputs.push({ ...base, keyword, location, experience_level })
    }
  }
  return inputs
}
