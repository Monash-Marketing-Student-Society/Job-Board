import { describe, it, expect } from 'vitest'
import { expiredActiveFilter } from './expiry'

function fakeQuery() {
  const eq: Array<[string, unknown]> = []
  const lt: Array<[string, unknown]> = []
  const q = {
    eq(col: string, val: unknown) {
      eq.push([col, val])
      return q
    },
    lt(col: string, val: unknown) {
      lt.push([col, val])
      return q
    },
    eqCalls: eq,
    ltCalls: lt,
  }
  return q
}

describe('expiredActiveFilter', () => {
  it('only touches jobs currently marked active', () => {
    const q = fakeQuery()
    expiredActiveFilter(q)
    expect(q.eqCalls).toContainEqual(['is_active', true])
  })

  it('only touches jobs whose closing date is in the past', () => {
    const now = new Date('2026-09-23T04:00:00.000Z')
    const q = fakeQuery()
    expiredActiveFilter(q, now)
    expect(q.ltCalls).toContainEqual(['closing_at', '2026-09-23T04:00:00.000Z'])
  })

  // A job with a null closing_at must never match `lt` against any date --
  // Postgres's own NULL semantics already guarantee this (`NULL < x` is
  // unknown, never true), so this is a regression guard on that assumption
  // rather than logic this function implements itself.
  it('applies exactly one is_active and one closing_at predicate, nothing else', () => {
    const q = fakeQuery()
    expiredActiveFilter(q)
    expect(q.eqCalls).toHaveLength(1)
    expect(q.ltCalls).toHaveLength(1)
  })

  it('returns the builder so the caller can keep chaining', () => {
    const q = fakeQuery()
    expect(expiredActiveFilter(q)).toBe(q)
  })
})
