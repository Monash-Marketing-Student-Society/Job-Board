import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  DWELL_MAX_MS,
  DWELL_MIN_MS,
  EVENT_TYPES,
  VISITOR_COOKIE,
} from '@/lib/analytics/constants'
import type { AnalyticsEventInsert, AnalyticsEventType } from '@/lib/types'

/**
 * Anonymous engagement tracking.
 *
 * Public on purpose — this is how job seekers, who never sign in, get counted.
 * Note the middleware's admin gate matches paths starting with `/admin`, which
 * `/api/track` does not, so nothing gates this implicitly either. That is
 * intended; do not add `isCurrentUserAdmin()` here.
 *
 * Every response is 204. Analytics is fire-and-forget: a tracking failure must
 * never surface to the visitor or hint at the schema behind it.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const noContent = () => new NextResponse(null, { status: 204 })

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const {
    event_type: eventType,
    job_id: jobId,
    duration_ms: durationMs,
  } = body as {
    event_type?: string
    job_id?: string
    duration_ms?: unknown
  }

  if (!EVENT_TYPES.includes(eventType as AnalyticsEventType)) return noContent()
  if (typeof jobId !== 'string' || !UUID_RE.test(jobId)) return noContent()

  // `dwell` is the only event carrying a measurement, and the only one a
  // client could use to distort an average rather than just inflate a count.
  // Out-of-range or non-integer durations are dropped outright rather than
  // clamped: a clamped value is a number this route invented, and it would be
  // indistinguishable in the table from one a visitor actually produced. The
  // same bounds are a CHECK constraint on the column (0022) — this is the
  // polite half of the pair, not the enforcement.
  const isDwell = eventType === 'dwell'
  const duration = isDwell ? toDuration(durationMs) : null

  if (isDwell && duration === null) return noContent()
  if (!isDwell && durationMs !== undefined) return noContent()

  // The visitor id comes from the cookie, never from the request body — a
  // client that could name its own visitor id could invent unlimited distinct
  // "viewers", which is the one number this dashboard exists to report.
  const visitorId = (await cookies()).get(VISITOR_COOKIE)?.value
  if (!visitorId || !UUID_RE.test(visitorId)) return noContent()

  const event: AnalyticsEventInsert = {
    event_type: eventType as AnalyticsEventType,
    job_id: jobId,
    visitor_id: visitorId,
    ...(duration === null ? {} : { duration_ms: duration }),
  }

  // Service role: `analytics_events` has no public INSERT policy, so this is
  // the only write path. `job_type`/`tags` are filled in by the table's
  // trigger, and `occurred_at` by its default.
  const { error } = await createAdminClient().from('analytics_events').insert(event)

  if (error) {
    // Logged, not returned — the visitor gets a 204 either way.
    console.error('Failed to record analytics event:', error)
  }

  return noContent()
}

/** A whole number of milliseconds inside the accepted band, or nothing. */
function toDuration(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null

  const ms = Math.round(value)
  if (ms < DWELL_MIN_MS || ms > DWELL_MAX_MS) return null

  return ms
}
