/**
 * Targeting: the three gates a posting must pass before it can publish.
 *
 * Any one gate alone is what would put a software graduate program, a senior
 * brand manager role, or a Perth internship in front of students -- all
 * three run, and the first hit against ANY of them rejects outright. Nothing
 * here calls a model: keyword rules decide first, and only what they can't
 * place returns 'unsure', which is the caller's cue to ask Gemini
 * (gemini-flash-lite-latest, matching the prefill route) before falling back
 * to review. That call lives in the worker, not here -- this module is pure
 * and synchronous on purpose, so it stays inside the vitest suite with no
 * network mocking needed.
 *
 * `tags` on TargetInput is the closed-vocabulary JOB_FUNCTIONS array a
 * normaliser will already have derived (lib/sync/normalise.ts, a later PR) --
 * this gate reads it, it doesn't compute it.
 */

import { statedSeniority, welcomesStudents } from './description-signals'
import { requiredExperience } from './experience'
import { resolveCity } from './location'
import { matchesAny } from './text-match'
import { JOB_FUNCTIONS, type JobFunction } from '../tags'
import type { JobType } from '../types'

export interface TargetInput {
  title: string
  jobType: JobType | null
  location: string | null
  /** Closed-vocabulary tags a normaliser already derived for this posting. */
  tags: JobFunction[]
  /** Sanitised HTML description, read for experience and seniority statements. */
  description?: string | null
  /** The employer's name, for the employer-specific rules. */
  company?: string | null
  /** LinkedIn's industry string ("Mining", "Construction"); absent for career sites. */
  industries?: string | null
  /** Lower bound of the employer's LinkedIn size band; absent when unknown (career sites, failed lookups). */
  employerSize?: number | null
  /** ISO closing date, if the posting states one. */
  closingAt?: string | null
  /** Injected for tests; defaults to the current time. */
  now?: Date
}

export type TargetVerdict = 'pass' | 'reject' | 'unsure'

/** Which check removed a posting -- stored so an admin can see why. */
export type TargetRule =
  | 'location'
  | 'excluded_field'
  | 'too_senior_title'
  | 'not_marketing'
  | 'experience_required'
  | 'too_senior_description'
  | 'employer_rule'
  | 'industry'
  | 'employer_size'
  | 'closing_soon'

/** Admin-facing wording for each rule, shown on /admin/filters. */
export const TARGET_RULE_LABELS: Record<TargetRule, string> = {
  location: 'Outside Melbourne/Sydney',
  excluded_field: 'Excluded field',
  too_senior_title: 'Too senior (title)',
  not_marketing: 'Not marketing',
  experience_required: 'Needs 1+ year',
  too_senior_description: 'Too senior (description)',
  employer_rule: 'Employer rule',
  industry: 'Industry',
  employer_size: 'Small employer (Sydney)',
  closing_soon: 'Closes within 2 weeks',
}

/** A stored rule may predate a rename, so fall back to the raw value. */
export function targetRuleLabel(rule: string): string {
  return (TARGET_RULE_LABELS as Record<string, string>)[rule] ?? rule
}

export interface TargetResult {
  verdict: TargetVerdict
  /** Set on a reject: the first check that fired. */
  rule?: TargetRule
  /** The text that triggered it, where there is one worth showing. */
  evidence?: string
}
type GateVerdict = 'yes' | 'maybe' | 'no'

// Titles carrying any of these are dropped before either the level or
// function gate runs -- PRD: "engineering, IT, accounting-only, legal or
// trades markers". Deliberately narrow rather than broad: 'analyst' and
// 'data' are NOT here, because Analytics is itself a marketing-adjacent
// JOB_FUNCTION (marketing/insights analyst roles are exactly what this board
// wants), and a broad IT/finance net would exclude them by accident.
const EXCLUSION_KEYWORDS = [
  // Engineering / IT
  'engineer', 'engineering', 'software', 'developer', 'programmer',
  'it support', 'information technology', 'systems administrator',
  'network engineer', 'devops', 'cybersecurity', 'help desk',
  // Accounting-only (not broader finance/commercial -- PRD says "accounting-only")
  'accounting', 'accountant', 'bookkeeping', 'bookkeeper', 'auditor',
  // Legal
  'lawyer', 'solicitor', 'paralegal', 'legal counsel',
  // Trades
  'electrician', 'plumber', 'carpenter', 'mechanic', 'welder', 'fitter', 'boilermaker',
]

function excluded(title: string): boolean {
  return matchesAny(title, EXCLUSION_KEYWORDS)
}

// Seniority markers checked first, so "Senior Marketing Coordinator" rejects
// despite "coordinator" being a pass keyword -- a coincidental junior-sounding
// word in an otherwise senior title must not outrank the seniority signal.
const SENIORITY_REJECT_KEYWORDS = ['senior', 'manager', 'head of', 'lead', 'director']

// Any "manager" rejects, "Assistant Brand Manager" included: the committee
// found those roles expect a year or two in industry (3 Oct 2026), so they
// no longer go to review as unsure.

// PRD's level list is {internship, graduate, vacationer, cadet} or an
// entry-level title {junior, assistant, coordinator, associate, trainee}.
// 'graduate'/'grad' are included here too, not just checked via job_type:
// schema.org's employmentType vocabulary (what a JSON-LD adapter maps
// job_type from) has no "graduate" value at all, so a graduate program whose
// only structured signal is employmentType: FULL_TIME needs the title match
// as a safety net, or it would incorrectly fall through to 'maybe'.
const PASS_LEVEL_KEYWORDS = [
  'vacationer', 'cadet', 'junior', 'assistant', 'coordinator', 'associate',
  'trainee', 'graduate', 'grad',
]

// Mid-level titles (12 Oct 2026, from the trial's rejects: 56 of 127 carried
// one of these). They mean a year or two in industry unless the title is an
// entry route -- "Brand Specialist (e-Commerce) Intern" -- or the description
// explicitly welcomes students or graduates. The description decides.
const MID_LEVEL_TITLE_KEYWORDS = ['executive', 'specialist', 'owner', 'consultant', 'partner', 'strategist']
const ENTRY_TITLE_KEYWORDS = [
  'intern', 'internship', 'graduate', 'grad', 'junior', 'trainee', 'cadet', 'student', 'vacationer',
  'program', 'programme',
]

function midLevelTitle(job: TargetInput): boolean {
  if (job.jobType === 'internship' || job.jobType === 'graduate') return false
  if (!matchesAny(job.title, MID_LEVEL_TITLE_KEYWORDS)) return false
  if (matchesAny(job.title, ENTRY_TITLE_KEYWORDS)) return false
  return !welcomesStudents(job.description)
}

// Roles that carry a marketing-sounding tag but aren't marketing -- the
// trial's "Not relevant" rejects (61 of 127). Phrases rather than single
// words where a word is also a marketing role: "Media Buyer" and "Junior
// Graphic Designer" stay, so a title that also names a marketing function
// is left to the other checks.
const NOT_MARKETING_TITLE_PHRASES = [
  // HR
  'human resources', 'hr', 'people and culture', 'people & culture', 'p&c', 'people partner',
  'people solutions', 'talent acquisition', 'recruiter', 'recruitment coordinator',
  // Customer service and travel sales
  'customer service', 'customer care', 'customer support', 'call centre', 'contact centre',
  'travel agent', 'travel consultant', 'travel sales', 'travel advisor', 'concierge',
  // Fashion design, buying and merchandising
  'womenswear', 'menswear', 'kidswear', 'accessories', 'apparel', 'footwear', 'garment', 'textile',
  'buyer', 'buying', 'merchandiser', 'merchandise planner', 'allocation analyst',
  'category coordinator', 'category assistant', 'category executive', 'category analyst', 'trade coordinator',
  // Finance
  'finance', 'financial analyst', 'accounts payable', 'accounts receivable', 'payroll', 'credit controller',
  // Operations, safety, technical
  'maintenance', 'health and safety', 'health safety', 'whs', 'security advisor', 'security officer',
  'driver', 'warehouse', 'supply chain', 'logistics', 'technical analyst', 'sensory',
  'game development officer',
]
const MARKETING_TITLE_WORDS = ['marketing', 'media', 'brand', 'communications', 'content', 'social']

function notMarketingPhrase(title: string): string | null {
  if (matchesAny(title, MARKETING_TITLE_WORDS)) return null
  return NOT_MARKETING_TITLE_PHRASES.find((phrase) => matchesAny(title, [phrase])) ?? null
}

// Employer-specific rules the admins set during the trial.
//
// Professional-services firms list mostly experienced consultant roles; only
// their entry routes belong on the board -- coordinators included in what
// goes (decided 12 Oct 2026).
const PROGRAMS_ONLY_EMPLOYERS = [
  'kpmg', 'deloitte', 'accenture', 'capgemini', 'ey', 'ernst & young', 'pwc', 'pricewaterhousecoopers',
]
const PROGRAM_TITLE_KEYWORDS = [
  ...ENTRY_TITLE_KEYWORDS, 'vacation', 'summer', 'part-time', 'part time', 'casual',
]

function employerRule(job: TargetInput): string | null {
  const company = job.company ?? ''
  if (matchesAny(company, PROGRAMS_ONLY_EMPLOYERS)) {
    const entryType = job.jobType === 'internship' || job.jobType === 'graduate' || job.jobType === 'part-time' || job.jobType === 'casual'
    if (!entryType && !matchesAny(job.title, PROGRAM_TITLE_KEYWORDS)) return `${company}: programs only`
  }
  // Red Bull runs a Student Marketeer role per campus; only Monash's is ours.
  if (matchesAny(company, ['red bull']) && matchesAny(job.title, ['student marketeer']) && !matchesAny(job.title, ['monash'])) {
    return 'Red Bull: Monash only'
  }
  return null
}

// Blue-collar industries (12 Oct 2026): tight budgets and little creative
// work, so not where marketing students look. Read from LinkedIn's industry
// string, the only source that has one. A posting that also names a
// consumer-facing industry stays -- Stryker lists "Industrial Machinery
// Manufacturing" beside medical equipment -- and plain "Manufacturing" is
// not here at all: Ferrero, PepsiCo and Henkel sit under it.
const BLUE_COLLAR_INDUSTRIES = [
  'mining', 'construction', 'building materials', 'machinery manufacturing',
  'climate technology product manufacturing', 'oil and gas', 'civil engineering',
  'specialty trade contractors', 'primary metal manufacturing', 'fabricated metal',
]
const CONSUMER_INDUSTRIES = [
  'medical', 'pharmaceutical', 'food', 'beverage', 'retail', 'consumer', 'software', 'it services',
  'marketing', 'advertising', 'media', 'appliances', 'personal care', 'entertainment',
]

function blueCollarIndustry(industries: string | null | undefined): string | null {
  if (!industries) return null
  if (matchesAny(industries, CONSUMER_INDUSTRIES)) return null
  return matchesAny(industries, BLUE_COLLAR_INDUSTRIES) ? industries : null
}

// Sydney employer size (12 Oct 2026): a Melbourne student rarely moves for a
// small firm, least of all for an internship. Measured on the trial's Sydney
// LinkedIn decisions: 1,000+ for internships kept 6 of 7 approved and removed
// all 4 rejected; 51+ for other roles drops the 2-50 person firms while
// keeping the 51-200 agencies admins approved (Digivizer, One Green Bean).
// Only applied when the size is known -- an unknown one goes to review.
export const SYDNEY_INTERNSHIP_MIN_EMPLOYEES = 1000
export const SYDNEY_ROLE_MIN_EMPLOYEES = 51

function smallSydneyEmployer(job: TargetInput, city: string): string | null {
  if (city !== 'sydney' || typeof job.employerSize !== 'number') return null
  const internship = job.jobType === 'internship' || matchesAny(job.title, ['intern', 'internship', 'vacationer'])
  const min = internship ? SYDNEY_INTERNSHIP_MIN_EMPLOYEES : SYDNEY_ROLE_MIN_EMPLOYEES
  if (job.employerSize >= min) return null
  return `LinkedIn size band starts at ${job.employerSize.toLocaleString('en-AU')}; a Sydney ${internship ? 'internship' : 'role'} needs ${min.toLocaleString('en-AU')}+`
}

// Admins review once a week (12 Oct 2026), so a job has to stay open for at
// least two: a week waiting for review, then a week live. No closing date is
// fine -- the nightly check retires those when they disappear (#135).
export const MIN_DAYS_OPEN = 14

function closesTooSoon(closingAt: string | null | undefined, now: Date): boolean {
  if (!closingAt) return false
  const closes = Date.parse(closingAt)
  if (Number.isNaN(closes)) return false
  return (closes - now.getTime()) / 86_400_000 < MIN_DAYS_OPEN
}

function levelGate(job: TargetInput): GateVerdict {
  if (job.jobType === 'internship' || job.jobType === 'graduate') return 'yes'
  if (matchesAny(job.title, SENIORITY_REJECT_KEYWORDS)) return 'no'
  if (matchesAny(job.title, PASS_LEVEL_KEYWORDS)) return 'yes'
  return 'maybe'
}

// The PRD's marketing-adjacent subset -- 10 of the 12 values in
// lib/tags.ts's JOB_FUNCTIONS. Operations and Management are deliberately
// excluded here even though they're valid tags elsewhere on the board: they
// were added in the tag-vocabulary backfill for existing submitted jobs, not
// because a generic ops or management role belongs on a marketing board.
const MARKETING_ADJACENT_FUNCTIONS: JobFunction[] = JOB_FUNCTIONS.filter(
  (fn) => fn !== 'Operations' && fn !== 'Management'
)

// A heuristic, not a certainty -- there is no closed vocabulary for "this is
// a generalist business program" the way there is for JOB_FUNCTIONS. Kept
// narrow (specific phrases, not a bare "business" or "commercial" anywhere
// in the title) so it doesn't swallow unrelated postings. This is why
// rotational intakes at the banks and the big four qualify even when their
// title carries no marketing-adjacent tag at all.
//
// `program(me)?` because Australian and UK employers write "Programme" --
// every Unilever early-careers title does (checked against the live feed,
// 24 Sep 2026). The American-only pattern sent those to review as unsure.
const GENERAL_BUSINESS_PROGRAM_PATTERNS = [
  /\bbusiness\s+graduate\b/i,
  /\bcommercial\s+graduate\b/i,
  /\bgraduate\s+rotational\b/i,
  /\bgraduate\s+development\s+program(me)?\b/i,
  /\bgraduate\s+program(me)?\b/i,
]

function isGeneralBusinessProgram(title: string): boolean {
  return GENERAL_BUSINESS_PROGRAM_PATTERNS.some((pattern) => pattern.test(title))
}

function functionGate(job: TargetInput): GateVerdict {
  if (job.tags.some((tag) => MARKETING_ADJACENT_FUNCTIONS.includes(tag))) return 'yes'
  if (isGeneralBusinessProgram(job.title)) return 'yes'
  // No tags at all means normalisation couldn't place it either -- genuine
  // uncertainty, not a confident "not marketing". A non-empty tag set that
  // still misses every marketing-adjacent value (only Operations, say) IS
  // confident enough to reject outright.
  if (job.tags.length === 0) return 'maybe'
  return 'no'
}

/**
 * The gates in order, with the reason for a reject. Location first because
 * it's the cheapest -- a string comparison that removes most of what an
 * aggregator returns before anything else runs. The description is read
 * last, only for a posting every title check would otherwise keep.
 */
export function assessTarget(job: TargetInput): TargetResult {
  const city = resolveCity(job.location)
  if (city === 'other') return { verdict: 'reject', rule: 'location', evidence: job.location ?? undefined }

  if (excluded(job.title)) return { verdict: 'reject', rule: 'excluded_field', evidence: job.title }

  const employer = employerRule(job)
  if (employer) return { verdict: 'reject', rule: 'employer_rule', evidence: employer }

  const industry = blueCollarIndustry(job.industries)
  if (industry) return { verdict: 'reject', rule: 'industry', evidence: industry }

  const small = smallSydneyEmployer(job, city)
  if (small) return { verdict: 'reject', rule: 'employer_size', evidence: small }

  const level = levelGate(job)
  if (level === 'no' || midLevelTitle(job)) return { verdict: 'reject', rule: 'too_senior_title', evidence: job.title }
  const notMarketing = notMarketingPhrase(job.title)
  if (notMarketing) return { verdict: 'reject', rule: 'not_marketing', evidence: notMarketing }
  const fn = functionGate(job)
  if (fn === 'no') return { verdict: 'reject', rule: 'not_marketing' }

  // A graduate or intern title is no protection here: an explicit "3+ years'
  // experience" is the employer saying who they will actually hire.
  const experience = requiredExperience(job.description)
  if (experience) return { verdict: 'reject', rule: 'experience_required', evidence: experience.evidence }

  // Any title, "Coordinator" included: the description is what says who
  // the employer will hire. A description that also welcomes graduates is
  // left to review rather than removed.
  const seniority = statedSeniority(job.description)
  if (seniority && !welcomesStudents(job.description)) {
    return { verdict: 'reject', rule: 'too_senior_description', evidence: seniority }
  }

  if (closesTooSoon(job.closingAt, job.now ?? new Date())) {
    return { verdict: 'reject', rule: 'closing_soon', evidence: `Closes ${job.closingAt!.slice(0, 10)}` }
  }

  // A location this gate can't place never publishes on a guess, however
  // clean the other gates are -- checked after them so an otherwise-
  // rejectable posting is rejected outright rather than sent to review for a
  // location that wouldn't have mattered anyway.
  if (city === 'unknown') return { verdict: 'unsure' }

  if (level === 'maybe' || fn === 'maybe') return { verdict: 'unsure' }

  return { verdict: 'pass' }
}

/** The verdict alone, for callers that don't need the reason. */
export function targets(job: TargetInput): TargetVerdict {
  return assessTarget(job).verdict
}
