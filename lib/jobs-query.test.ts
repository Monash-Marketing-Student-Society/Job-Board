import { describe, it, expect } from 'vitest'
import { liveJobs, unexpiredFilter } from './jobs-query'

/**
 * A stand-in for the PostgREST builder that records what was applied to it.
 * The real client needs a network round trip to say anything, and what matters
 * here is only which predicates the helper adds and that it hands the builder
 * back for the caller to keep chaining.
 */
function fakeQuery() {
  const eq: Array<[string, unknown]> = []
  const or: string[] = []
  const q = {
    eq(col: string, val: unknown) {
      eq.push([col, val])
      return q
    },
    or(filter: string) {
      or.push(filter)
      return q
    },
    eqCalls: eq,
    orCalls: or,
  }
  return q
}

describe('unexpiredFilter', () => {
  it('matches jobs with no closing date or one still ahead', () => {
    const now = new Date('2026-09-23T04:00:00.000Z')
    expect(unexpiredFilter(now)).toBe('closing_at.is.null,closing_at.gt.2026-09-23T04:00:00.000Z')
  })

  // The board's closing dates are stored as timestamptz and compared in UTC.
  // A naive local-time format here would shift every deadline by ten hours in
  // Melbourne, which is a whole day's worth of wrong on a job closing tonight.
  it('formats the boundary as UTC ISO, not local time', () => {
    expect(unexpiredFilter(new Date('2026-09-23T23:30:00.000Z'))).toContain('2026-09-23T23:30:00.000Z')
  })
})

describe('liveJobs', () => {
  it('requires the job to be active', () => {
    const q = fakeQuery()
    liveJobs(q)
    expect(q.eqCalls).toContainEqual(['is_active', true])
  })

  it('excludes jobs past their closing date', () => {
    const now = new Date('2026-09-23T04:00:00.000Z')
    const q = fakeQuery()
    liveJobs(q, now)
    expect(q.orCalls).toEqual([unexpiredFilter(now)])
  })

  it('returns the builder so the caller can keep chaining', () => {
    const q = fakeQuery()
    expect(liveJobs(q)).toBe(q)
  })

  // Both predicates or neither: the sponsored branches shipped with the
  // closing-date check absent AND is_active absent, which is exactly how a
  // deactivated, long-closed sponsored job stayed pinned to the top.
  it('applies both predicates, not just one', () => {
    const q = fakeQuery()
    liveJobs(q)
    expect(q.eqCalls).toHaveLength(1)
    expect(q.orCalls).toHaveLength(1)
  })
})
