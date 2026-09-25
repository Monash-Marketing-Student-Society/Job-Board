/**
 * Structured job-posting extraction: schema.org JSON-LD and the embedded JS
 * state modern ATS platforms hydrate from (Next.js `__NEXT_DATA__`,
 * Greenhouse, Lever). Moved out of app/api/prefill-job/route.ts unchanged --
 * byte-identical logic, just relocated -- so the sync worker's 'listing'
 * adapter can share it rather than duplicate it: "collect each posting's
 * URL from the careers page and run it through that route" (TDD, "Source
 * adapters"). The route becomes a thin caller of this module; the AI tier,
 * OG-tag fallback, and the route handler itself stay where they are, since
 * none of those are things the worker wants (its own Gemini call, per
 * target.ts, is a different prompt for a different question).
 *
 * This move has no test coverage of its own history to lean on -- the route
 * predates it and vitest only collects lib/**\/*.test.ts, so app/** was
 * never under test. extract.test.ts is the first automated coverage this
 * logic has ever had.
 */

import { normalizeJobType } from '../utils'
import { toJobFunctions, type JobFunction } from '../tags'

export interface StructuredJobFields {
  title?: string
  company?: string
  company_logo_url?: string
  description?: string
  location?: string
  job_type?: string
  closing_at?: string
  tags?: JobFunction[]
}

function extractLocation(jobLocation: unknown): string | null {
  const loc = Array.isArray(jobLocation) ? jobLocation[0] : jobLocation
  if (!loc) return null
  if (typeof loc === 'string') return loc.trim() || null
  if (typeof loc === 'object') {
    const addr = (loc as Record<string, unknown>).address
    if (typeof addr === 'string') return addr.trim() || null
    if (typeof addr === 'object' && addr !== null) {
      const a = addr as Record<string, string>
      return [a.addressLocality, a.addressRegion, a.addressCountry]
        .filter(Boolean).join(', ') || null
    }
  }
  return null
}

function mapEmploymentType(raw: unknown): string | null {
  if (!raw) return null
  const val = (Array.isArray(raw) ? raw[0] : raw) as string
  const normalized = val
    .toLowerCase()
    .replace(/_/g, '-')
    .replace('contractor', 'contract')
    .replace(/\bintern\b/, 'internship')
  return normalizeJobType(normalized)
}

function toDateString(iso: unknown): string | null {
  if (!iso || typeof iso !== 'string') return null
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return null
    return d.toISOString().split('T')[0]
  } catch {
    return null
  }
}

function extractLogoUrl(logo: unknown): string | null {
  if (!logo) return null
  if (typeof logo === 'string') return logo
  if (typeof logo === 'object') {
    const l = logo as Record<string, unknown>
    return (l.url as string) || (l.contentUrl as string) || null
  }
  return null
}

/** Convert a skills/qualifications field (string or array) to a comma-separated tag string */
function extractTagString(raw: unknown): string | null {
  if (!raw) return null
  if (typeof raw === 'string') return raw.trim() || null
  if (Array.isArray(raw)) {
    return raw
      .map(v => (typeof v === 'string' ? v.trim() : ''))
      .filter(Boolean)
      .join(', ') || null
  }
  return null
}

/** Strip HTML tags from a description string and return clean plain text or light HTML */
function cleanDescription(raw: string): string {
  if (!/<[a-z][\s\S]*>/i.test(raw)) {
    return `<p>${raw.replace(/\n\n+/g, '</p><p>').replace(/\n/g, '<br>')}</p>`
  }
  return raw
}

export function findJobPosting(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== 'object') return null
  const obj = data as Record<string, unknown>

  if (obj['@type'] === 'JobPosting') return obj

  if (Array.isArray(obj['@graph'])) {
    for (const node of obj['@graph']) {
      const found = findJobPosting(node)
      if (found) return found
    }
  }

  if (Array.isArray(data)) {
    for (const node of data) {
      const found = findJobPosting(node)
      if (found) return found
    }
  }

  return null
}

/** Shared mapping: convert a JobPosting node to StructuredJobFields */
export function mapJobPostingToData(job: Record<string, unknown>): Partial<StructuredJobFields> {
  const org = job.hiringOrganization as Record<string, unknown> | undefined

  const closingAt =
    toDateString(job.validThrough) ||
    toDateString(job.applicationDeadline) ||
    null

  const skillTags = extractTagString(job.skills)
  const qualTags = extractTagString(job.qualifications)
  const allTags = [skillTags, qualTags]
    .filter(Boolean)
    .join(', ')
    .split(',')
    .map(t => t.trim())
    .filter(Boolean)
  const uniqueTags = [...new Set(allTags)]

  const rawDesc = job.description as string | undefined
  const jobFunctions = toJobFunctions(uniqueTags)

  return {
    title: (job.title as string) || undefined,
    company: (org?.name as string) || undefined,
    company_logo_url: extractLogoUrl(org?.logo) || undefined,
    description: rawDesc ? cleanDescription(rawDesc) : undefined,
    location: extractLocation(job.jobLocation) || undefined,
    job_type: mapEmploymentType(job.employmentType) || undefined,
    closing_at: closingAt || undefined,
    tags: jobFunctions.length > 0 ? jobFunctions : undefined,
  }
}

export function extractJsonLd(html: string): Partial<StructuredJobFields> {
  const scriptRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let match: RegExpExecArray | null

  while ((match = scriptRe.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(match[1])
      const job = findJobPosting(parsed)
      if (job) return mapJobPostingToData(job)
    } catch {
      // Malformed JSON-LD — try next block
    }
  }

  return {}
}

/**
 * Many modern SPAs (Next.js, Greenhouse, Lever) embed their initial data as JSON
 * in the HTML before hydration. This extracts job posting data from those payloads.
 */
export function extractEmbeddedState(html: string): Partial<StructuredJobFields> {
  const patterns = [
    // Next.js __NEXT_DATA__ (used by Greenhouse, Lever, many ATS platforms)
    /<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i,
    // Generic window state objects
    /window\.__(?:INITIAL_STATE|REDUX_STATE|APP_STATE|APP_DATA)__\s*=\s*(\{[\s\S]{0,50000}?\})\s*;/,
    // ATS-specific named script tags
    /<script[^>]+id=["'](?:gh-job-data|lever-job-info|ats-job-data)["'][^>]*>([\s\S]*?)<\/script>/i,
  ]

  for (const re of patterns) {
    const m = re.exec(html)
    if (!m) continue
    try {
      const parsed = JSON.parse(m[1])
      // Quick pre-check: look for a JobPosting @type anywhere in the blob
      if (!/"@type"\s*:\s*"JobPosting"/.test(m[1])) continue
      const job = findJobPosting(parsed)
      if (job) return mapJobPostingToData(job)
    } catch {
      // Malformed — try next pattern
    }
  }

  return {}
}
