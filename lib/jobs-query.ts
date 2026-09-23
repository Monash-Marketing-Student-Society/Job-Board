/**
 * The one place that decides which jobs the public may see.
 *
 * Two conditions, and both have been wrong on the live board:
 *
 *  - `is_active` was missing from the sponsored branches entirely, so a
 *    deactivated sponsored job still pinned itself to the top of the page.
 *  - Nothing anywhere filtered on `closing_at`, so a job whose deadline passed
 *    weeks ago stayed listed. `isJobExpired()` existed but only decorated the
 *    detail page.
 *
 * A nightly sweep flips `is_active` off once a closing date passes, but the
 * board must not depend on a cron having run — so the closing date is filtered
 * at read time too. Both layers, deliberately.
 *
 * Every public path that selects from `jobs` goes through `liveJobs()`. Keeping
 * it in one function is the point: a future read path cannot forget a predicate
 * it never had to write.
 */

/**
 * PostgREST `or` filter matching jobs that have not closed: either no closing
 * date at all, or one still in the future.
 *
 * `now` is injectable so the behaviour at the boundary is testable.
 */
export function unexpiredFilter(now: Date = new Date()): string {
  return `closing_at.is.null,closing_at.gt.${now.toISOString()}`
}

/**
 * The two builder methods this helper needs. Deliberately its own type rather
 * than a constraint on `Q`: a self-referential constraint makes the compiler
 * walk PostgrestFilterBuilder's own recursion and it gives up with TS2589.
 */
type Filterable = {
  eq(column: string, value: unknown): Filterable
  or(filter: string): Filterable
}

/**
 * Restrict a `jobs` query to what students may see: active, and not past its
 * closing date.
 *
 * Takes and returns the query builder untouched otherwise, so it composes with
 * whatever `select`, ordering and pagination the caller already applied — and
 * `Q` flows straight through, so the call site keeps the real builder's type.
 */
export function liveJobs<Q>(query: Q, now: Date = new Date()): Q {
  const filterable = query as unknown as Filterable
  return filterable.eq('is_active', true).or(unexpiredFilter(now)) as unknown as Q
}
