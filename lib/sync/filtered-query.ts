/**
 * URL state for /admin/filters' Filtered out list: search, rule and how many
 * rows to load. Kept in the URL, not client state, because the list is read
 * on the server -- a filter applied in the browser could only ever narrow
 * the rows already loaded, which is how postings past the first 300 became
 * unreachable (Oct 2026).
 */
import { TARGET_RULE_LABELS, type TargetRule } from './target'

export const FILTERED_PAGE_SIZE = 300
/** Past this, "Show more" stops growing the page; search instead. */
export const FILTERED_MAX_LIMIT = 3000

export interface FilteredParams {
  q: string
  rule: TargetRule | null
  limit: number
}

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? ''
}

/**
 * Search text reduced to letters, digits, spaces and `& ' . -`. Everything
 * else either breaks a PostgREST `or=` filter (commas, parentheses, quotes)
 * or is an ilike wildcard (`%`, `_`), and none of it is needed to find a job
 * by title or company.
 */
export function cleanSearch(raw: string): string {
  return raw
    .replace(/[^\p{L}\p{N} &'.-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100)
}

export function parseFilteredParams(params: Record<string, string | string[] | undefined>): FilteredParams {
  const rule = first(params.rule)
  const limit = parseInt(first(params.limit), 10)
  return {
    q: cleanSearch(first(params.q)),
    rule: rule in TARGET_RULE_LABELS ? (rule as TargetRule) : null,
    limit: Number.isFinite(limit)
      ? Math.min(Math.max(limit, FILTERED_PAGE_SIZE), FILTERED_MAX_LIMIT)
      : FILTERED_PAGE_SIZE,
  }
}

/** The PostgREST `or` filter matching a cleaned search on title or company. */
export function searchFilter(q: string): string | null {
  if (!q) return null
  return `normalised->>title.ilike."*${q}*",normalised->>company.ilike."*${q}*"`
}

/** The query string for a state, with defaults left out so the bare URL stays bare. */
export function filteredHref({ q, rule, limit }: FilteredParams): string {
  const params = new URLSearchParams()
  if (q) params.set('q', q)
  if (rule) params.set('rule', rule)
  if (limit > FILTERED_PAGE_SIZE) params.set('limit', String(limit))
  const query = params.toString()
  return query ? `/admin/filters?${query}` : '/admin/filters'
}
