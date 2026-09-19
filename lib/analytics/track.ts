import { DWELL_MAX_MS, DWELL_MIN_MS } from '@/lib/analytics/constants'
import type { AnalyticsEventType } from '@/lib/types'

/**
 * Client-side engagement tracking.
 *
 * Fire-and-forget by design: nothing here returns a promise callers can await,
 * and nothing throws. A broken analytics endpoint must not break the job board.
 */

const ENDPOINT = '/api/track'

/**
 * Events already sent this page load, keyed `type:jobId`.
 *
 * Without this, `view` would fire on every re-render of the detail panel and a
 * single visitor idling on one job would look like dozens of views. Scoped to
 * the module, so a full navigation legitimately resets it.
 */
const sent = new Set<string>()

export function trackEvent(type: AnalyticsEventType, jobId: string | null | undefined): void {
  if (typeof window === 'undefined' || !jobId) return

  const key = `${type}:${jobId}`
  if (sent.has(key)) return
  sent.add(key)

  send({ event_type: type, job_id: jobId })
}

/**
 * How long the visitor spent on one listing.
 *
 * Deliberately outside `trackEvent`'s once-per-page dedupe: a visitor who
 * opens a listing, moves on and comes back has genuinely read it twice, and
 * both readings belong in the average. It is also the one event that reports a
 * measurement rather than a fact, so the caller passes the number and this
 * decides whether it is worth sending at all.
 *
 * Out-of-band durations are dropped here as well as in the route. Doing it on
 * the client too means an idle tab's beacon never leaves the machine.
 */
export function trackDwell(jobId: string | null | undefined, durationMs: number): void {
  if (typeof window === 'undefined' || !jobId) return

  const ms = Math.round(durationMs)
  if (!Number.isFinite(ms) || ms < DWELL_MIN_MS || ms > DWELL_MAX_MS) return

  send({ event_type: 'dwell', job_id: jobId, duration_ms: ms })
}

/** The fire-and-forget transport shared by both. */
function send(body: Record<string, unknown>): void {
  const payload = JSON.stringify(body)

  try {
    // sendBeacon matters most for `apply`, which fires as the browser is
    // already navigating to the employer's site, and for `dwell`, which fires
    // as the tab is being hidden or closed — a normal fetch would be cancelled
    // mid-flight and both would go uncounted.
    if (navigator.sendBeacon?.(ENDPOINT, new Blob([payload], { type: 'application/json' }))) {
      return
    }

    void fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
    }).catch(() => {
      // Swallowed: see the module comment.
    })
  } catch {
    // Swallowed: see the module comment.
  }
}

/** Escape hatch for tests, which need a clean dedupe set between cases. */
export function __resetTrackedEvents(): void {
  sent.clear()
}
