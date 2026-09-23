/**
 * The nightly closing-date sweep.
 *
 * lib/jobs-query.ts (a separate, unmerged PR) stops an expired job being READ
 * back to students. This is the other half: actually flipping `is_active` off
 * in bulk, so the admin lists stop showing it as live too, rather than relying
 * on the read-time filter forever. Same predicate components/admin/job-table.tsx
 * already applies by hand in its "mark expired" bulk action -- kept as one
 * function so the manual action and the automated sweep can't drift apart.
 */

/** The two builder methods this needs, kept minimal for the same reason as jobs-query.ts's Filterable. */
type ExpirySweepQuery = {
  eq(column: string, value: unknown): ExpirySweepQuery
  lt(column: string, value: unknown): ExpirySweepQuery
}

/**
 * Restricts an UPDATE builder to jobs that are still active but whose closing
 * date has passed. Caller supplies `.update({ is_active: false, ... })`
 * before this and reads the result after.
 */
export function expiredActiveFilter<Q>(query: Q, now: Date = new Date()): Q {
  const filterable = query as unknown as ExpirySweepQuery
  return filterable.eq('is_active', true).lt('closing_at', now.toISOString()) as unknown as Q
}
