/**
 * Normalisation: raw postings from a specific vendor onto the shape the
 * board already takes, plus a confidence map recording which fields were
 * actually read versus left for the targeting gates or a human to judge.
 *
 * One function per vendor, not one generic function branching on a raw
 * shape -- each ATS structures the same three or four facts (closing date,
 * description, location, employment type) completely differently, and a
 * single function trying to introspect an untyped `raw` blob for all of them
 * would be guessing at a shape it can't see coming. Grounded in the two real
 * vendor responses fetched 23 Sep 2026 (fixtures in
 * lib/sync/adapters/__fixtures__/workday-detail.json and
 * greenhouse-detail.json), not invented.
 *
 * Deliberately NOT built here: a JSON-LD normaliser for the 'listing'
 * adapter fallback. The TDD's own research found no employer among those
 * checked whose posting pages carry JobPosting JSON-LD at all -- building
 * that path now would mean testing against a shape I invented rather than
 * one anyone actually publishes. app/api/prefill-job/route.ts already has a
 * working JSON-LD extractor (mapJobPostingToData); moving it to
 * lib/prefill/extract.ts for the worker to share, per the TDD's own plan, is
 * a deliberate follow-up -- that route has no test coverage today (vitest
 * only collects lib/**\/*.test.ts), so refactoring it belongs in its own
 * reviewed change, not bundled into new, unrelated normaliser code.
 */

import { normalizeJobType, truncateText, decodeHtmlEntities } from '../utils'
import { sanitizeDescription } from '../sanitize'
import { JOB_FUNCTIONS, toJobFunctions, type JobFunction } from '../tags'
import { matchesAny } from './text-match'
import type { JobType, WorkMode } from '../types'

export interface NormalisedJob {
  title: string
  company: string
  location: string | null
  work_mode: WorkMode | null
  job_type: JobType | null
  url: string
  description: string | null
  tags: JobFunction[]
  posted_at: string | null
  closing_at: string | null
}

export type FieldConfidence = 'read' | 'inferred'
export type NormaliseConfidence = Partial<Record<keyof NormalisedJob, FieldConfidence>>

export interface NormaliseResult {
  job: NormalisedJob
  confidence: NormaliseConfidence
}

const DESCRIPTION_MAX_LENGTH = 5000

// ── Shared: keyword tag inference ──────────────────────────────────────────
//
// A heuristic, like the exclusion/level keyword lists in target.ts -- no
// vendor exposes a marketing-taxonomy field, so this is the only source of
// `tags` short of a Gemini call (which belongs to the worker, not this pure
// module). Kept narrow per function rather than trying to be exhaustive: a
// missed tag sends the posting to review via the function gate's 'maybe'
// path (see target.ts), which is the safe direction: a real marketing-
// adjacent job with no tag detected is NOT rejected, only held for a second
// look -- so under-tagging costs a review, over-tagging would cost a wrong
// publish.
const FUNCTION_KEYWORDS: Record<JobFunction, string[]> = {
  Brand: ['brand', 'branding'],
  Communications: ['communications', 'communication', 'public relations', 'corporate affairs', 'media relations'],
  Creative: ['creative', 'copywriting', 'copywriter', 'graphic design', 'art direction'],
  Events: ['events', 'event management', 'event coordination', 'activations'],
  Analytics: ['analytics', 'insights', 'market research', 'consumer insights', 'data analysis'],
  'Social Media': ['social media', 'content creation', 'community management', 'content marketing'],
  Digital: [
    'digital marketing', 'digital media', 'seo', 'sem', 'performance marketing',
    'ecommerce', 'e-commerce', 'digital channels',
  ],
  Strategy: ['strategy', 'strategic planning', 'brand strategy'],
  Sales: ['sales', 'business development', 'account management', 'account manager', 'client services'],
  Product: ['product marketing', 'product management'],
  Operations: ['operations', 'supply chain', 'logistics'],
  Management: ['management trainee', 'people management'],
}

/**
 * Infers up to MAX_JOB_FUNCTIONS tags from a title and description via
 * keyword matching, in JOB_FUNCTIONS's own order so results are stable.
 * Empty when nothing matches -- callers treat that as genuine uncertainty
 * (target.ts's function gate returns 'maybe' for an empty tag set), not as
 * "confidently not marketing".
 */
export function inferJobFunctions(title: string, description: string | null): JobFunction[] {
  const text = `${title} ${description ?? ''}`
  const found: string[] = []
  for (const fn of JOB_FUNCTIONS) {
    if (matchesAny(text, FUNCTION_KEYWORDS[fn])) found.push(fn)
  }
  return toJobFunctions(found)
}

function cleanDescription(html: string | null | undefined): string | null {
  if (!html) return null
  return sanitizeDescription(truncateText(html, DESCRIPTION_MAX_LENGTH * 4)) || null
  // truncateText runs before sanitizeDescription, generously, purely to cap
  // pathological input size before the HTML parser touches it -- the real
  // length limit belongs on the rendered/plain-text form, not the markup,
  // which is why it's 4x the target and not the final word on length.
}

// ── Workday ──────────────────────────────────────────────────────────────

export interface WorkdayRawPosting {
  jobPostingInfo: {
    title: string
    jobDescription: string | null
    location: string | null
    jobReqId: string | null
    externalUrl: string
    endDate: string | null
    timeType?: string | null
  }
}

/**
 * Verified fields (23 Sep 2026, unilever.wd3.myworkdayjobs.com): title,
 * jobDescription (real HTML, not entity-escaped -- unlike Greenhouse below),
 * location (a plain string, fed straight to lib/sync/location.ts), endDate
 * (an ISO date -- Workday's own name for what the TDD calls validThrough,
 * which is JSON-LD terminology Workday doesn't use), externalUrl (the real
 * apply link). No per-posting employment-level field exists at all --
 * `timeType` ("Full time"/"Part time") is a schedule, not a level, so it
 * maps to job_type as a best-available signal but doesn't help distinguish
 * an internship from a permanent role. That distinction depends entirely on
 * target.ts's title-keyword level gate for Workday postings, which is why
 * that gate's title fallback list includes 'graduate'/'grad' rather than
 * relying on job_type alone.
 */
export function normaliseWorkdayPosting(raw: WorkdayRawPosting, company: string): NormaliseResult {
  const info = raw.jobPostingInfo
  const confidence: NormaliseConfidence = { title: 'read', company: 'read', url: 'read' }

  const description = cleanDescription(info.jobDescription)
  if (info.jobDescription) confidence.description = 'read'

  if (info.location) confidence.location = 'read'
  if (info.endDate) confidence.closing_at = 'read'

  const jobType = info.timeType ? normalizeJobType(info.timeType) : null
  if (jobType) confidence.job_type = 'read'

  const tags = inferJobFunctions(info.title, description)
  if (tags.length > 0) confidence.tags = 'inferred' // keyword-matched, never structured

  const job: NormalisedJob = {
    title: info.title,
    company,
    location: info.location,
    work_mode: null, // Workday's per-posting response carries no work-mode signal
    job_type: jobType,
    url: info.externalUrl,
    description,
    tags,
    posted_at: null, // postedOn is relative text ("Posted 9 Days Ago"), not a usable date
    closing_at: info.endDate,
  }

  return { job, confidence }
}

// ── Greenhouse ───────────────────────────────────────────────────────────

export interface GreenhouseRawPosting {
  title: string
  location: { name: string | null } | null
  content: string | null
  absolute_url: string
  application_deadline: string | null
  employment_type?: string | null
}

/**
 * Verified fields (23 Sep 2026, boards-api.greenhouse.io/v1/boards/ogilvyaus):
 * title, location.name (free text, sometimes several offices joined with
 * "; " on one posting), absolute_url, application_deadline (present as a
 * field but null on every posting checked -- Greenhouse's own admins have to
 * opt into setting it). `employment_type` doesn't appear in the response AT
 * ALL for this employer, not merely null -- treated as always-possibly-absent
 * here, never assumed present.
 *
 * `content` is HTML, but double-escaped: the literal string starts
 * `&lt;p&gt;`, not `<p>`. decodeHtmlEntities() (lib/utils.ts) unwraps that
 * one layer before sanitizeDescription() gets a chance to see real markup --
 * skipping this step would store literal `&lt;p&gt;` text on the board.
 */
export function normaliseGreenhousePosting(raw: GreenhouseRawPosting, company: string): NormaliseResult {
  const confidence: NormaliseConfidence = { title: 'read', company: 'read', url: 'read' }

  const location = raw.location?.name ?? null
  if (location) confidence.location = 'read'

  const decodedContent = raw.content ? decodeHtmlEntities(raw.content) : null
  const description = cleanDescription(decodedContent)
  if (raw.content) confidence.description = 'read'

  if (raw.application_deadline) confidence.closing_at = 'read'

  const jobType = raw.employment_type ? normalizeJobType(raw.employment_type) : null
  if (jobType) confidence.job_type = 'read'

  const tags = inferJobFunctions(raw.title, description)
  if (tags.length > 0) confidence.tags = 'inferred'

  const job: NormalisedJob = {
    title: raw.title,
    company,
    location,
    work_mode: null,
    job_type: jobType,
    url: raw.absolute_url,
    description,
    tags,
    posted_at: null,
    closing_at: raw.application_deadline,
  }

  return { job, confidence }
}
