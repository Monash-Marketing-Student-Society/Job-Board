/**
 * Keeping jobs with no closing date honest.
 *
 * A job listed with "No closing date" never expires on its own, so the
 * nightly maintain task checks it three ways, any one of which takes it down:
 *
 *  1. The posting page says it has closed ("no longer accepting
 *     applications") -- pageSaysClosed. A 404 or a redirect to a careers
 *     index is already caught by the link check for every job; this catches
 *     the page that stays up and says so in words.
 *  2. A synced job has dropped out of its source's feed -- goneFromFeed. The
 *     sync bumps job_fingerprints.last_seen_at every night a live job's
 *     posting is still listed, so two clean runs since it was last seen
 *     means the employer took it down.
 *  3. It has been up 60 days -- openEndedExpired. The backstop for a page
 *     the check can't read (a JavaScript-only careers site) and a job with
 *     no source. Counted from the later of when it was created and when it
 *     was last taken down, so re-listing it gives another 60 days.
 *
 * Pure, so the rules are under test; src/trigger/maintain.ts does the I/O.
 */

/** The reasons jobs.expired_reason accepts (0058). */
export type ExpiredReason =
  | 'closing_date_passed'
  | 'link_dead'
  | 'page_says_closed'
  | 'gone_from_feed'
  | 'open_ended_60_days'

export const EXPIRED_REASON_LABELS: Record<ExpiredReason, string> = {
  closing_date_passed: 'Closing date passed',
  link_dead: 'Apply link stopped working',
  page_says_closed: 'Posting says it has closed',
  gone_from_feed: 'Removed from the employer’s site',
  open_ended_60_days: 'No closing date, up 60 days',
}

export function expiredReasonLabel(reason: string | null | undefined): string | null {
  if (!reason) return null
  return EXPIRED_REASON_LABELS[reason as ExpiredReason] ?? null
}

export const OPEN_ENDED_MAX_DAYS = 60

const DAY_MS = 86_400_000

export function openEndedExpired(
  job: { created_at: string; expired_at: string | null },
  now: Date = new Date()
): boolean {
  const from = Math.max(Date.parse(job.created_at), job.expired_at ? Date.parse(job.expired_at) : 0)
  return now.getTime() - from >= OPEN_ENDED_MAX_DAYS * DAY_MS
}

/**
 * Phrases an employer's page uses once a role has closed. Specific on
 * purpose: "applications close on 30 November" or "closing date" must not
 * match, and neither must a careers page's generic copy.
 */
const CLOSED_PHRASES = [
  /no longer accepting applications/,
  /(?:this|the) (?:job|role|position|vacancy|posting|job posting|opportunity) (?:is|has) (?:no longer (?:available|active|open)|expired|closed|been filled)/,
  /(?:this|the) (?:job|role|position|vacancy|posting|job posting|opportunity) (?:you(?:'|’)re|you are) looking for is no longer/,
  /applications (?:for this (?:role|job|position) )?(?:have|are now) closed/,
  /position has (?:now )?been filled/,
  /(?:job|posting|vacancy|advert) (?:has )?expired/,
]

/** Lower-cased visible text: script and style bodies removed, tags stripped, entities that matter decoded. */
export function visibleText(html: string): string {
  return html
    .replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&#39;|&#x27;|&rsquo;/g, '’')
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

/** The phrase that says the posting has closed, or null. */
export function pageSaysClosed(html: string): string | null {
  const text = visibleText(html)
  for (const pattern of CLOSED_PHRASES) {
    const match = text.match(pattern)
    if (match) return match[0]
  }
  return null
}

export interface SourceRun {
  started_at: string
  finished_at: string | null
  error: string | null
  zero_guard_tripped: boolean | null
}

/** Clean runs needed since a posting was last seen before it counts as gone. */
export const MISSED_RUNS_TO_EXPIRE = 2

/**
 * Whether the source has run cleanly at least twice since it last listed this
 * posting. Only clean runs count: one that errored, never finished, or
 * tripped the zero guard (the feed came back suspiciously empty) says
 * nothing about whether the posting is still there.
 */
export function goneFromFeed(lastSeenAt: string | null, runs: SourceRun[]): boolean {
  if (!lastSeenAt) return false
  const seen = Date.parse(lastSeenAt)
  const cleanSince = runs.filter(
    (r) => r.finished_at && !r.error && !r.zero_guard_tripped && Date.parse(r.started_at) > seen
  )
  return cleanSince.length >= MISSED_RUNS_TO_EXPIRE
}

/** Reads at most `max` bytes of a response body as text -- careers pages can be large. */
export async function readTextCapped(res: Response, max = 512_000): Promise<string> {
  if (!res.body) return ''
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let out = ''
  let read = 0
  while (read < max) {
    const { done, value } = await reader.read()
    if (done) break
    read += value.byteLength
    out += decoder.decode(value, { stream: true })
  }
  await reader.cancel().catch(() => {})
  // A single chunk can overshoot the cap; the closed-notice sits near the top anyway.
  return out.slice(0, max)
}
