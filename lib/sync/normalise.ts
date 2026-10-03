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
 * The JSON-LD normaliser (bottom of this file) came later than the TDD
 * expected: its research found no employer whose posting pages carried
 * JobPosting JSON-LD, but Myer's careers site (2 Oct 2026) does, so it reads
 * a real shape. It reuses lib/prefill/extract.ts's mapping rather than a
 * second copy of it.
 */

import { normalizeJobType, truncateText, decodeHtmlEntities } from '../utils'
import { sanitizeDescription } from '../sanitize'
import { JOB_FUNCTIONS, toJobFunctions, type JobFunction } from '../tags'
import { matchesAny } from './text-match'
import { mapJobPostingToData } from '../prefill/extract'
import type { PageUpItem } from './adapters/pageup'
import type { JobAdderRawPosting } from './adapters/jobadder'
import type { SmartRecruitersDetail, SmartRecruitersListRow } from './adapters/smartrecruiters'
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
/**
 * Some tenants label locations as a code, not a place: Mars's are
 * `AUS-Victoria-Melbourne` (country-state-city). That string would be shown
 * on the board as-is, so it's rewritten to `Melbourne, Victoria`. Anything
 * not in that exact shape is returned unchanged -- P&G's `SYDNEY GO` (a site
 * code) is left for a reviewer rather than guessed at.
 */
export function tidyWorkdayLocation(location: string | null | undefined): string | null {
  if (!location) return null
  const coded = /^[A-Z]{3}-([^-]+)-(.+)$/.exec(location.trim())
  return coded ? `${coded[2].trim()}, ${coded[1].trim()}` : location
}

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
    location: tidyWorkdayLocation(info.location),
    work_mode: null, // Workday's per-posting response carries no work-mode signal
    job_type: jobType,
    url: info.externalUrl,
    description,
    tags,
    posted_at: null, // postedOn is relative text ("Posted 9 Days Ago"), not a usable date
    // `?? null`: P&G's detail omits endDate entirely rather than sending null.
    closing_at: info.endDate ?? null,
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
  /** ISO timestamp with offset; on the list endpoint, absent from the older detail fixture. */
  first_published?: string | null
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
    posted_at: raw.first_published ?? null,
    closing_at: raw.application_deadline,
  }

  return { job, confidence }
}

// ── JSON-LD (schema.org JobPosting) ──────────────────────────────────────

/**
 * Verified fields (2 Oct 2026, careers.myergroup.com.au): title, description
 * (real HTML), employmentType ("FULL_TIME"), validThrough and datePosted
 * (ISO timestamps), jobLocation (a Place array; on Myer's expressions of
 * interest the locality is the literal "Various Locations", which
 * lib/sync/location.ts resolves to unknown, so they go to review).
 *
 * Field mapping is lib/prefill/extract.ts's mapJobPostingToData -- the same
 * one the prefill route uses -- except that its description is only
 * paragraph-wrapped, not sanitised, so it is sanitised here, and closing_at
 * keeps validThrough's full timestamp instead of the UTC date the prefill
 * form wants (Myer's 16:45Z is the next day in Melbourne).
 */
export function normaliseJsonLdPosting(raw: Record<string, unknown>, company: string, url: string): NormaliseResult {
  const mapped = mapJobPostingToData(raw)
  const confidence: NormaliseConfidence = { title: 'read', company: 'read', url: 'read' }

  const title = typeof raw.title === 'string' ? raw.title.trim() : ''
  const location = mapped.location ?? null
  if (location) confidence.location = 'read'

  const description = cleanDescription(mapped.description)
  if (description) confidence.description = 'read'

  const jobType = normalizeJobType(mapped.job_type)
  if (jobType) confidence.job_type = 'read'

  const closingAt = isoTimestamp(raw.validThrough) ?? isoTimestamp(raw.applicationDeadline)
  if (closingAt) confidence.closing_at = 'read'

  const tags = inferJobFunctions(title, description)
  if (tags.length > 0) confidence.tags = 'inferred'

  const job: NormalisedJob = {
    title,
    company,
    location,
    work_mode: null, // jobLocationType ("TELECOMMUTE") would carry it; Myer doesn't send it
    job_type: jobType,
    url,
    description,
    tags,
    posted_at: isoTimestamp(raw.datePosted),
    closing_at: closingAt,
  }

  return { job, confidence }
}

function isoTimestamp(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null
  return Number.isNaN(new Date(value).getTime()) ? null : value
}

// ── Oracle Recruiting Cloud ──────────────────────────────────────────────

export interface OracleRawPosting {
  Id: string
  Title: string
  PrimaryLocation: string | null
  PostedDate: string | null
  JobSchedule?: string | null
  detail: {
    ExternalDescriptionStr?: string | null
    ExternalResponsibilitiesStr?: string | null
    ExternalQualificationsStr?: string | null
    ExternalPostedEndDate?: string | null
  }
}

/**
 * Verified fields (2 Oct 2026, Penfolds/TWE and Ipsos): the description is
 * real HTML split across three detail fields (description, responsibilities,
 * qualifications), joined in that order. `ExternalPostedEndDate` is the
 * closing date when the employer sets one -- null on every posting checked,
 * so most Oracle jobs are held for missing_closing_date. `JobSchedule` was
 * null too; read when present. `PostedDate` is a plain date.
 */
export function normaliseOraclePosting(raw: OracleRawPosting, company: string, url: string): NormaliseResult {
  const confidence: NormaliseConfidence = { title: 'read', company: 'read', url: 'read' }

  const location = raw.PrimaryLocation ?? null
  if (location) confidence.location = 'read'

  const html = [raw.detail.ExternalDescriptionStr, raw.detail.ExternalResponsibilitiesStr, raw.detail.ExternalQualificationsStr]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join('\n')
  const description = cleanDescription(html)
  if (description) confidence.description = 'read'

  const closingAt = raw.detail.ExternalPostedEndDate ?? null
  if (closingAt) confidence.closing_at = 'read'

  const jobType = raw.JobSchedule ? normalizeJobType(raw.JobSchedule) : null
  if (jobType) confidence.job_type = 'read'

  const tags = inferJobFunctions(raw.Title, description)
  if (tags.length > 0) confidence.tags = 'inferred'

  const job: NormalisedJob = {
    title: raw.Title,
    company,
    location,
    work_mode: null,
    job_type: jobType,
    url,
    description,
    tags,
    posted_at: raw.PostedDate ?? null,
    closing_at: closingAt,
  }
  return { job, confidence }
}

// ── JobAdder ─────────────────────────────────────────────────────────────

/**
 * JobAdder's work-type labels are the board owner's own wording. Seen on
 * 2 Oct 2026: "Permanent / Full Time", "Part-time", "Casual", "Contract or
 * Temp". Anything else is left null for a reviewer.
 */
export function jobAdderJobType(label: string | null): JobType | null {
  if (!label) return null
  const l = label.toLowerCase()
  if (/\bintern/.test(l)) return 'internship'
  if (/\bgraduate\b/.test(l)) return 'graduate'
  if (/full[\s-]?time/.test(l)) return 'full-time'
  if (/part[\s-]?time/.test(l)) return 'part-time'
  if (/\bcasual\b/.test(l)) return 'casual'
  if (/\b(contract|temp)\b/.test(l)) return 'contract'
  return null
}

/**
 * Verified fields (2 Oct 2026, Yo-Chi and Seed Heritage widgets): title,
 * classification labels (location and work type picked out by
 * config.categories in the adapter), the posted date, and the detail page's
 * bullet points and description HTML. No closing date exists anywhere in
 * the widget, so closing_at is always null and the posting is held.
 */
export function normaliseJobAdderPosting(raw: JobAdderRawPosting, company: string, url: string): NormaliseResult {
  const confidence: NormaliseConfidence = { title: 'read', company: 'read', url: 'read' }

  if (raw.location) confidence.location = 'read'

  const description = cleanDescription(raw.descriptionHtml)
  if (description) confidence.description = 'read'

  const jobType = jobAdderJobType(raw.jobType)
  if (jobType) confidence.job_type = 'read'

  const tags = inferJobFunctions(raw.title, description)
  if (tags.length > 0) confidence.tags = 'inferred'

  const job: NormalisedJob = {
    title: raw.title,
    company,
    location: raw.location,
    work_mode: null,
    job_type: jobType,
    url,
    description,
    tags,
    posted_at: raw.postedOn,
    closing_at: null,
  }

  return { job, confidence }
}

// ── PageUp ───────────────────────────────────────────────────────────────

/**
 * PageUp's work type is free text ("Permanent - Full Time", "Casual",
 * "Fixed Term - Part Time"), which normalizeJobType's exact matches can't
 * read. Most specific first: an internship or graduate role beats its hours.
 */
export function pageUpJobType(workType: string | null | undefined): NormalisedJob['job_type'] {
  if (!workType) return null
  const t = workType.toLowerCase()
  // Whole words only: Asahi's "Fixed Term - Full Time,Internal Secondment"
  // once read as an internship, and a senior manager role passed as clean.
  if (/\bintern(ship)?s?\b/.test(t)) return 'internship'
  if (/\bgraduate|\bgrad\b/.test(t)) return 'graduate'
  if (/\bcasual/.test(t)) return 'casual'
  if (/fixed[ -]term|\bcontract|temporary/.test(t)) return 'contract'
  if (/part[ -]?time/.test(t)) return 'part-time'
  if (/full[ -]?time/.test(t)) return 'full-time'
  return null
}

/** An RFC 1123 feed date ("Thu, 15 Oct 2026 12:55:00 GMT", or "... Z") as ISO, or null. */
function feedDate(value: string | null | undefined): string | null {
  if (!value) return null
  const d = new Date(value.replace(/ Z$/, ' GMT'))
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/**
 * Verified fields (2 Oct 2026, Asahi's feed): `job:description` is real HTML
 * once the feed's single layer of escaping is decoded (the adapter does
 * that); `job:closingDate` is set on every Asahi job; `job:location` is a
 * city or region ("Melbourne", "NSW - other", "NZ").
 */
export function normalisePageUpPosting(raw: PageUpItem, company: string): NormaliseResult {
  const confidence: NormaliseConfidence = { title: 'read', company: 'read', url: 'read' }

  const location = raw.location ?? null
  if (location) confidence.location = 'read'

  const description = cleanDescription(raw.description ?? raw.summary)
  if (raw.description) confidence.description = 'read'

  const closingAt = feedDate(raw.closingDate)
  if (closingAt) confidence.closing_at = 'read'

  const jobType = pageUpJobType(raw.workType)
  if (jobType) confidence.job_type = 'read'

  const tags = inferJobFunctions(raw.title, description)
  if (tags.length > 0) confidence.tags = 'inferred'

  const job: NormalisedJob = {
    title: raw.title,
    company,
    location,
    work_mode: null,
    job_type: jobType,
    url: raw.link,
    description,
    tags,
    posted_at: feedDate(raw.pubDate),
    closing_at: closingAt,
  }
  return { job, confidence }
}

// ── SmartRecruiters ──────────────────────────────────────────────────────

export type SmartRecruitersRawPosting = SmartRecruitersListRow & { detail: SmartRecruitersDetail }

/** Job-ad sections in reading order; companyDescription last, as background. */
const SMARTRECRUITERS_SECTIONS = ['jobDescription', 'qualifications', 'additionalInformation', 'companyDescription']

/**
 * Verified fields (2 Oct 2026, KPMG Australia and Luxury Escapes): the job
 * ad is HTML split into sections; location is structured (city, region);
 * `typeOfEmployment.label` is "Full-time", "Part-time", "Intern" and the
 * like; `experienceLevel` ("entry_level", "internship") is the level signal
 * the targeting gates can use. SmartRecruiters has no closing date, so every
 * job is held for missing_closing_date.
 */
export function normaliseSmartRecruitersPosting(raw: SmartRecruitersRawPosting, company: string, url: string): NormaliseResult {
  const confidence: NormaliseConfidence = { title: 'read', company: 'read', url: 'read' }

  const loc = raw.location ?? null
  const location = loc?.city ? [loc.city, loc.region].filter(Boolean).join(', ') : null
  if (location) confidence.location = 'read'

  const sections = raw.detail.jobAd?.sections ?? {}
  const html = SMARTRECRUITERS_SECTIONS.map((key) => sections[key]?.text)
    .filter((part): part is string => Boolean(part && part.trim()))
    .join('\n')
  const description = cleanDescription(html)
  if (description) confidence.description = 'read'

  // An internship-level posting is an internship whatever its hours say.
  const jobType =
    raw.experienceLevel?.id === 'internship'
      ? 'internship'
      : normalizeJobType((raw.typeOfEmployment?.label ?? '').toLowerCase())
  if (jobType) confidence.job_type = 'read'

  const tags = inferJobFunctions(raw.name, description)
  if (tags.length > 0) confidence.tags = 'inferred'

  const job: NormalisedJob = {
    title: raw.name,
    company,
    location,
    work_mode: loc?.remote ? 'remote' : null,
    job_type: jobType,
    url,
    description,
    tags,
    posted_at: raw.releasedDate ?? null,
    closing_at: null,
  }
  return { job, confidence }
}


// ── LinkedIn (Bright Data) ───────────────────────────────────────────────

/** How long a LinkedIn job stays up: no closing date is published, so posted + 30 days stands in. */
export const LINKEDIN_LISTING_DAYS = 30

/**
 * LinkedIn's job description arrives wrapped in its "show more / show less"
 * widget: a `<section>`, a clamp `<div>`, then `<button>`s whose labels the
 * sanitizer would keep as stray text. Only the markup before the first
 * button is the description.
 */
export function linkedInDescriptionHtml(html: string | null | undefined): string | null {
  if (!html) return null
  const start = html.match(/<div[^>]*show-more-less-html__markup[^>]*>/)
  let body = start ? html.slice((start.index ?? 0) + start[0].length) : html
  const button = body.indexOf('<button')
  if (button !== -1) body = body.slice(0, button)
  return body.replace(/<\/div>\s*$/, '').trim() || null
}

/** Plain text (`job_summary`) as minimal HTML, for a record with no formatted description. */
function plainTextHtml(text: string): string {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `<p>${escaped}</p>`
}

/**
 * LinkedIn's seniority and employment type onto the board's job types.
 * Internship wins over hours; "Graduate" only from the title, because
 * LinkedIn has no graduate level ("Entry level" is shown for grad programs
 * and for any junior full-time role alike, so it sets nothing here and the
 * targeting gates read the title instead).
 */
export function linkedInJobType(title: string, seniority: string | null | undefined, employment: string | null | undefined): JobType | null {
  const s = (seniority ?? '').toLowerCase()
  const e = (employment ?? '').toLowerCase()
  if (s === 'internship' || e === 'internship' || /\bintern(ship)?s?\b/i.test(title)) return 'internship'
  if (/\bgraduate|\bgrad\b/i.test(title)) return 'graduate'
  if (e === 'part-time') return 'part-time'
  if (e === 'contract' || e === 'temporary') return 'contract'
  if (e === 'full-time') return 'full-time'
  return null
}

/** The LinkedIn job page without its tracking query (`?_l=en`, `trk=`), keyed on the posting id. */
function linkedInJobPage(postingId: string): string {
  return `https://www.linkedin.com/jobs/view/${postingId}/`
}

export interface LinkedInRawPosting {
  job_posting_id: string
  url?: string
  apply_link?: string | null
  job_title: string
  company_name: string
  job_location?: string | null
  job_summary?: string | null
  job_description_formatted?: string | null
  job_seniority_level?: string | null
  job_employment_type?: string | null
  job_posted_date?: string | null
}

/**
 * Verified fields (live, 3 Oct 2026) -- see lib/sync/adapters/linkedin.ts.
 * `company` is LinkedIn's company name for this posting, not the source's
 * name: one source, every employer. The logo is left to the approved-logo
 * table; `company_logo` is a media.licdn.com URL that can expire.
 */
export function normaliseLinkedInPosting(raw: LinkedInRawPosting, company: string, applyUrl: string): NormaliseResult {
  const confidence: NormaliseConfidence = { title: 'read', company: 'read', url: 'read' }

  // "Melbourne, Victoria, Australia" -> "Melbourne, Victoria"
  const location = raw.job_location?.replace(/,\s*Australia$/i, '').trim() || null
  if (location) confidence.location = 'read'

  const formatted = linkedInDescriptionHtml(raw.job_description_formatted)
  const description = cleanDescription(formatted ?? (raw.job_summary ? plainTextHtml(raw.job_summary) : null))
  if (description) confidence.description = 'read'

  const jobType = linkedInJobType(raw.job_title, raw.job_seniority_level, raw.job_employment_type)
  if (jobType) confidence.job_type = 'read'

  const tags = inferJobFunctions(raw.job_title, description)
  if (tags.length > 0) confidence.tags = 'inferred'

  const postedAt = isoTimestamp(raw.job_posted_date)
  let closingAt: string | null = null
  if (postedAt) {
    const closing = new Date(postedAt)
    closing.setUTCDate(closing.getUTCDate() + LINKEDIN_LISTING_DAYS)
    closingAt = closing.toISOString()
    confidence.closing_at = 'inferred'
  }

  // An external apply link is the employer's own page; otherwise the clean LinkedIn job page.
  const isLinkedInPage = /(^|\.)linkedin\.com$/i.test(new URL(applyUrl).hostname)
  const url = isLinkedInPage ? linkedInJobPage(raw.job_posting_id) : applyUrl

  const job: NormalisedJob = {
    title: raw.job_title,
    company,
    location,
    work_mode: null,
    job_type: jobType,
    url,
    description,
    tags,
    posted_at: postedAt,
    closing_at: closingAt,
  }
  return { job, confidence }
}
