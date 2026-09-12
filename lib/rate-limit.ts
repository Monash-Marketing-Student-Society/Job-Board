import crypto from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Per-IP rate limit for POST /api/submit-job, backed by the
 * check_submission_rate_limit() function added in
 * supabase/migrations/0017_submission_rate_limits.sql. See that file for why
 * the counter lives in Postgres rather than in process memory.
 *
 * A legitimate employer submits a handful of roles in one sitting; five in an
 * hour is generous for that and still throttles a script hard.
 */
const MAX_ATTEMPTS = 5
const WINDOW = '1 hour'

/**
 * Best-effort client IP from the proxy headers Vercel sets on every request.
 * `x-forwarded-for` is attacker-controlled on a request that reaches your
 * server directly, but Vercel's edge overwrites it before the function sees
 * it, so the first entry is the real client. Falls back to `x-real-ip`, then
 * a constant so a request with neither header (only plausible outside
 * Vercel, e.g. `next dev`) fails closed into one shared bucket rather than
 * skipping the limit entirely.
 */
export function clientIp(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) return forwardedFor.split(',')[0].trim()
  return request.headers.get('x-real-ip')?.trim() || 'unknown'
}

function hashIp(ip: string): string {
  return crypto.createHash('sha256').update(ip).digest('hex')
}

/**
 * True if this request is within the limit (and has just been recorded),
 * false if the caller is over the cap and should get a 429.
 *
 * On any database error — including migration 0017 not having been applied
 * yet, in which case the RPC does not exist — this fails open and returns
 * true. A broken or not-yet-deployed limiter must not take the public submit
 * form down; the error is logged so a permanently-broken limiter is still
 * visible.
 */
export async function allowSubmission(
  client: SupabaseClient,
  request: Request
): Promise<boolean> {
  const { data, error } = await client.rpc('check_submission_rate_limit', {
    p_ip_hash: hashIp(clientIp(request)),
    p_max: MAX_ATTEMPTS,
    p_window: WINDOW,
  })

  if (error) {
    console.error('Rate-limit check failed; allowing the submission:', error)
    return true
  }

  return data !== false
}
