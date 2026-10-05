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
  /** Sanitised HTML description, read only for a stated experience requirement. */
  description?: string | null
}

export type TargetVerdict = 'pass' | 'reject' | 'unsure'

/** Which check removed a posting -- stored so an admin can see why. */
export type TargetRule = 'location' | 'excluded_field' | 'too_senior_title' | 'not_marketing' | 'experience_required'

/** Admin-facing wording for each rule, shown on /admin/filters. */
export const TARGET_RULE_LABELS: Record<TargetRule, string> = {
  location: 'Outside Melbourne/Sydney',
  excluded_field: 'Excluded field',
  too_senior_title: 'Too senior (title)',
  not_marketing: 'Not marketing',
  experience_required: 'Needs 1+ year',
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

  const level = levelGate(job)
  if (level === 'no') return { verdict: 'reject', rule: 'too_senior_title', evidence: job.title }
  const fn = functionGate(job)
  if (fn === 'no') return { verdict: 'reject', rule: 'not_marketing' }

  // A graduate or intern title is no protection here: an explicit "3+ years'
  // experience" is the employer saying who they will actually hire.
  const experience = requiredExperience(job.description)
  if (experience) return { verdict: 'reject', rule: 'experience_required', evidence: experience.evidence }

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
