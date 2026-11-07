/**
 * One check of whether a posting is still open, shared by the routine
 * maintain run (live jobs and the review queue) and the approve route (so an
 * admin can't publish a job that has already closed).
 *
 * Closed means one of: a 404/410, a redirect to a listing page, LinkedIn's
 * expired-job redirect, or a page that says in words it has closed. Anything
 * ambiguous -- a timeout, a bot wall, a 5xx -- is 'unknown', never 'closed':
 * one bad answer must not take a live job down.
 */

import { fetchPublicUrl } from '@/lib/ssrf'
import { classifyLinkCheck } from '@/lib/sync/link'
import { pageSaysClosed, readTextCapped } from './open-ended'

export const POSTING_CHECK_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; MMSSJobBoard/1.0)',
  Accept: 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-AU,en;q=0.9',
}

export type PostingCheck =
  | { state: 'open' }
  | { state: 'closed'; reason: string }
  | { state: 'unknown' }

/**
 * LinkedIn sends an expired job to a keyword search tagged
 * `trk=expired_jd_redirect` ("/jobs/brand-manager-jobs?trk=..."), answering
 * 200 -- a path the listing-page check reads as a posting. Seen on 10 of 50
 * live jobs on 7 Nov 2026.
 */
export function isExpiredRedirect(finalUrl: string): boolean {
  try {
    return new URL(finalUrl).searchParams.get('trk') === 'expired_jd_redirect'
  } catch {
    return false
  }
}

/** What a fetched posting says about itself. Pure, so the rules are under test. */
export function readPostingResponse(result: { status: number; finalUrl: string; html: string | null } | null): PostingCheck {
  if (result && isExpiredRedirect(result.finalUrl)) return { state: 'closed', reason: 'LinkedIn: expired job' }
  const action = classifyLinkCheck(result)
  if (action.outcome === 'unpublish') return { state: 'closed', reason: action.reason }
  if (action.outcome === 'strike') return { state: 'unknown' }
  const phrase = result?.html ? pageSaysClosed(result.html) : null
  return phrase ? { state: 'closed', reason: phrase } : { state: 'open' }
}

export async function checkPosting(url: string, timeoutMs = 10_000): Promise<PostingCheck> {
  let target: URL
  try {
    target = new URL(url)
  } catch {
    return { state: 'unknown' }
  }
  const res = await fetchPublicUrl(target, { timeoutMs, headers: POSTING_CHECK_HEADERS })
  if (!res) return readPostingResponse(null)
  const finalUrl = res.url || target.toString()
  const html = res.status >= 200 && res.status < 300 ? await readTextCapped(res) : null
  if (!res.bodyUsed) await res.body?.cancel().catch(() => {})
  return readPostingResponse({ status: res.status, finalUrl, html })
}
