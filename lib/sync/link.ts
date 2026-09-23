/**
 * Job-specific vs generic URL classification, and what the nightly link check
 * does with a fetch result.
 *
 * Shared by two callers that will land in separate PRs: the nightly link check
 * (this PR), which re-walks every published job's apply URL and unpublishes one
 * that has gone dead or generic; and the sync worker (later), which refuses to
 * publish a job whose apply URL isn't job-specific in the first place. Same
 * question both times -- "does this URL point at one posting, or at a listing?"
 * -- so one classifier, not two.
 */

/**
 * Path segments (case-insensitive) that mean "this is a listing, not a
 * posting" when they are the LAST segment of the path. Deliberately a short,
 * closed list rather than a broad pattern match.
 *
 * The failure directions are not symmetric. Calling a real posting page
 * "generic" unpublishes a live job over nothing -- the expensive mistake.
 * Calling a genuinely generic page "job-specific" just means the link check
 * doesn't catch that particular drift and the job stays up one more night,
 * which the timeout/5xx strike path or a human catches soon enough. So this
 * list only holds terms unambiguous enough that a false "generic" verdict is
 * very unlikely, and every other path shape defaults to job-specific.
 */
const INDEX_TERMS = new Set([
  'careers', 'career',
  'jobs', 'job',
  'vacancies', 'vacancy',
  'opportunities', 'opportunity',
  'positions', 'position',
  'openings', 'opening',
  'search', 'browse', 'index', 'home', 'listings', 'listing',
])

/**
 * Query parameters that carry a job id on otherwise generic-looking ATS
 * search paths (Workday's `/job` results page, some Greenhouse embeds). A
 * generic-looking last path segment doesn't downgrade to "generic" if one of
 * these is present and non-empty.
 */
const JOB_ID_PARAMS = ['jobid', 'job_id', 'gh_jid', 'jvid', 'req', 'reqid', 'req_id']

/**
 * Known limitation, not fixed here: an ATS listing root that carries no path
 * segment beyond the org's own slug (`boards.greenhouse.io/ogilvyaus`) reads
 * as job-specific by this heuristic, because "ogilvyaus" isn't a recognised
 * index term. Distinguishing it needs per-vendor routing knowledge this
 * function doesn't have. Consequence is the safe direction described above --
 * a redirect-to-listing-root goes undetected rather than a real posting
 * getting flagged.
 */
export function isJobSpecificUrl(rawUrl: string): boolean {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return false // unparseable is never job-specific
  }

  const segments = url.pathname.split('/').filter(Boolean)
  if (segments.length === 0) return false // bare root

  const last = decodeURIComponent(segments[segments.length - 1]).toLowerCase()
  if (!INDEX_TERMS.has(last)) return true

  // Param names are matched case-insensitively (?jobId=, ?JobID=, ?jobid= all
  // count) -- URLSearchParams.get() is case-sensitive, so the keys are
  // lowercased before comparing rather than looking each candidate up directly.
  for (const [key, value] of url.searchParams) {
    if (JOB_ID_PARAMS.includes(key.toLowerCase()) && value) return true
  }

  return false
}

/** Consecutive timeout/ambiguous-status checks before a job is unpublished. */
export const LINK_CHECK_STRIKE_LIMIT = 3

export type LinkCheckAction =
  | { outcome: 'ok' }
  | { outcome: 'unpublish'; reason: 'dead_link' | 'link_went_generic' }
  | { outcome: 'strike' }

/**
 * Turns one fetch result into what the nightly check does next.
 *
 * `result` is null for whatever `fetchPublicUrl` (lib/ssrf.ts) returns null
 * for: a blocked host, a non-http(s) scheme, a network error or timeout, or a
 * redirect chain that never resolved. All of those are indistinguishable from
 * here, and all get the same conservative answer as an ambiguous status code
 * -- a strike, never an immediate unpublish, because a firewall or a slow
 * night looks identical to a dead job from this vantage point.
 *
 * Only two things unpublish immediately: an unambiguous 404/410, and a 2xx
 * that resolved to a generic-looking final URL (`finalUrl` -- the URL actually
 * served, after every redirect `fetchPublicUrl` followed, which is `res.url`
 * on the response it returns). Everything else -- other 4xx (401/403/429,
 * bot walls and rate limits, not dead links), 5xx, and no-result -- is a
 * strike: three in a row is what unpublishes, so one bad night never does.
 */
export function classifyLinkCheck(result: { status: number; finalUrl: string } | null): LinkCheckAction {
  if (result === null) return { outcome: 'strike' }

  const { status, finalUrl } = result

  if (status === 404 || status === 410) {
    return { outcome: 'unpublish', reason: 'dead_link' }
  }

  if (status >= 200 && status < 300) {
    return isJobSpecificUrl(finalUrl)
      ? { outcome: 'ok' }
      : { outcome: 'unpublish', reason: 'link_went_generic' }
  }

  return { outcome: 'strike' }
}
