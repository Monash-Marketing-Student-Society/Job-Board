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

/**
 * A plain SHA-256 of an IPv4 address is not meaningfully anonymous: the
 * address space is only 2^32 values, so hashing every one of them and
 * matching against a stored `ip_hash` recovers the original address in well
 * under an hour on a single CPU core (seconds on a GPU) — a brute force over
 * the *hash function*, not over the data, since there is no secret in it.
 * RATE_LIMIT_HASH_PEPPER is that secret: with it, `hashIp` is an HMAC keyed
 * on a value only this server knows, so the same exhaustive-IPv4-space
 * attack requires the pepper as well and is no longer a pure hash-cracking
 * problem.
 *
 * Missing pepper falls back to the original unsalted hash rather than
 * throwing — a misconfigured or absent secret degrades privacy, it must not
 * take the public submit form down — logging once per cold start so the gap
 * is visible in practice without spamming on every request.
 *
 * Read from `process.env` inside the function rather than cached at module
 * load: cheap, and it means a test can flip the env var between cases
 * without a module reset.
 */
let warnedMissingPepper = false

function hashIp(ip: string): string {
  const pepper = process.env.RATE_LIMIT_HASH_PEPPER
  if (!pepper) {
    if (!warnedMissingPepper) {
      console.error(
        'RATE_LIMIT_HASH_PEPPER is not set — rate-limit IP hashes are unsalted and ' +
          'reversible across the whole IPv4 address space. Set it to restore the ' +
          'intended privacy guarantee.'
      )
      warnedMissingPepper = true
    }
    return crypto.createHash('sha256').update(ip).digest('hex')
  }
  return crypto.createHmac('sha256', pepper).update(ip).digest('hex')
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
