import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import crypto from 'crypto'

/**
 * NOTE: `shadcn init` and `shadcn add` both write their own `lib/utils.ts`,
 * containing `cn()` and nothing else — silently, with no merge and no warning.
 * That is what emptied this file during the Tailwind v4 migration, and every
 * import below broke at once ("formatDate is not a function", eleven files).
 *
 * If these helpers disappear again, that is the cause, and
 * `git show <commit-before>:lib/utils.ts` is the recovery. To avoid it, run the
 * shadcn CLI and then check this file before committing.
 */

/**
 * Merge Tailwind CSS classes with proper precedence
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Generate a stable hash for job deduplication
 * Used when external_id is not available
 */
export function generateJobHash(
  title: string,
  company: string,
  url: string,
  postedAt?: string | null
): string {
  const data = `${title.toLowerCase().trim()}|${company.toLowerCase().trim()}|${url.toLowerCase().trim()}|${postedAt || ''}`
  return crypto.createHash('sha256').update(data).digest('hex').substring(0, 32)
}

const NAMED_HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

/**
 * Decode HTML entities in scraped/AI-prefilled text (job titles in
 * particular — source pages sometimes hand back `Title &#124; Company`
 * instead of `Title | Company`). Presentation-only: doesn't touch stored
 * data, just what's rendered. Covers named entities from the table above,
 * decimal (`&#124;`), and hex (`&#x7c;`) numeric entities — not a full
 * HTML-entity table, but the handful that actually show up in titles/company
 * names rather than markup.
 */
export function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#\d+|#x[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, code: string) => {
    if (code[0] === '#') {
      const codePoint = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
      return Number.isNaN(codePoint) ? match : String.fromCodePoint(codePoint)
    }
    return NAMED_HTML_ENTITIES[code] ?? match
  })
}

/**
 * Format a date for display
 */
export function formatDate(date: string | null | undefined): string {
  if (!date) return ''
  return new Date(date).toLocaleDateString('en-AU', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/**
 * Format relative time (e.g., "2 days ago")
 */
export function formatRelativeTime(date: string | null | undefined): string {
  if (!date) return ''

  const now = new Date()
  const then = new Date(date)
  const diffMs = now.getTime() - then.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`
  return `${Math.floor(diffDays / 365)} years ago`
}

/**
 * Check if a job's closing date has passed
 */
export function isJobExpired(closingAt: string | null | undefined): boolean {
  if (!closingAt) return false
  return new Date(closingAt) < new Date()
}

/**
 * Calculate days until closing
 */
export function daysUntilClosing(closingAt: string | null | undefined): number | null {
  if (!closingAt) return null
  const now = new Date()
  const closing = new Date(closingAt)
  const diffMs = closing.getTime() - now.getTime()
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24))
}

/**
 * Normalize work mode string to valid enum value
 */
export function normalizeWorkMode(value: string | undefined | null): 'remote' | 'hybrid' | 'onsite' | null {
  if (!value) return null
  const normalized = value.toLowerCase().trim()
  if (normalized === 'remote' || normalized === 'work from home' || normalized === 'wfh') return 'remote'
  if (normalized === 'hybrid' || normalized === 'flexible') return 'hybrid'
  if (normalized === 'onsite' || normalized === 'on-site' || normalized === 'office') return 'onsite'
  return null
}

/**
 * Normalize job type string to valid enum value
 */
export function normalizeJobType(value: string | undefined | null): 'internship' | 'graduate' | 'part-time' | 'full-time' | 'casual' | 'contract' | null {
  if (!value) return null
  const normalized = value.toLowerCase().trim()
  if (normalized === 'internship' || normalized === 'intern') return 'internship'
  if (normalized === 'graduate' || normalized === 'grad' || normalized === 'graduate program') return 'graduate'
  if (normalized === 'part-time' || normalized === 'part time' || normalized === 'parttime') return 'part-time'
  if (normalized === 'full-time' || normalized === 'full time' || normalized === 'fulltime') return 'full-time'
  if (normalized === 'casual') return 'casual'
  if (normalized === 'contract' || normalized === 'contractor') return 'contract'
  return null
}

/**
 * Truncate text to a maximum length with ellipsis, cutting at the last word
 * boundary within the limit rather than mid-word — a raw substring cut reads
 * as broken (e.g. "...campaign materia...") wherever the source text doesn't
 * happen to end exactly at maxLength.
 */
export function truncateText(text: string | null | undefined, maxLength: number): string {
  if (!text) return ''
  if (text.length <= maxLength) return text
  const cut = text.slice(0, maxLength)
  const lastSpace = cut.lastIndexOf(' ')
  const trimmed = lastSpace > 0 ? cut.slice(0, lastSpace) : cut
  return trimmed.trim() + '...'
}

/**
 * Parse search query into individual terms
 */
export function parseSearchQuery(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(term => term.length > 0)
}

/**
 * Build a URL with query parameters
 */
export function buildUrl(base: string, params: Record<string, string | number | boolean | undefined | null>): string {
  const url = new URL(base, 'http://placeholder')
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value))
    }
  })
  return `${url.pathname}${url.search}`
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

/**
 * Validate a job's application link: either an http(s) URL or a bare email
 * address. Some employers — small businesses, hiring managers without a
 * careers page — have HR handle applications directly over email instead of
 * a dedicated posting, so `jobs.url` / `job_submissions.url` accept both.
 */
export function isValidApplicationUrl(value: string): boolean {
  // Reject anything carrying a non-http(s) URI scheme (mailto:, javascript:,
  // data:, ftp:, ...) up front. Without this, "mailto:a@b.c" slips past the
  // loose email regex below as if it were a bare address — the stored value
  // must be the plain email, since toApplicationHref() is what adds the
  // `mailto:` scheme at render time.
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) && !/^https?:\/\//i.test(value)) {
    return false
  }
  if (isValidEmail(value)) return true
  if (!/^https?:\/\//i.test(value)) return false
  try {
    new URL(value)
    return true
  } catch {
    return false
  }
}

/**
 * Turn a job's `url` field into an `<a href>` — prefixing a bare email with
 * `mailto:` so it opens a mail client instead of failing as a relative link.
 * A stored http(s) URL is already a valid href and passes through unchanged.
 */
export function toApplicationHref(url: string): string {
  return isValidEmail(url) ? `mailto:${url}` : url
}

/**
 * Capitalize first letter of each word
 */
export function capitalizeWords(text: string): string {
  return text
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

/**
 * Slugify text for URL-safe strings
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

/**
 * Calculate pagination range for Supabase
 */
export function getPaginationRange(page: number, pageSize: number): { from: number; to: number } {
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  return { from, to }
}

/**
 * Calculate total pages from count
 */
export function getTotalPages(total: number, pageSize: number): number {
  return Math.ceil(total / pageSize)
}
