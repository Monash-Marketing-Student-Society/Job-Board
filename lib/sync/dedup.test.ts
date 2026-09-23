import { describe, it, expect } from 'vitest'
import { sourceRank, resolveDuplicate } from './dedup'

describe('sourceRank', () => {
  it('ranks manual and submission jobs as human', () => {
    expect(sourceRank('manual', null)).toBe('human')
    expect(sourceRank('submission', null)).toBe('human')
  })

  it('ranks a tier-A synced source as employer_site', () => {
    expect(sourceRank('sync:unilever', 'A')).toBe('employer_site')
  })

  it('ranks a tier-B synced source as aggregator', () => {
    expect(sourceRank('sync:adzuna', 'B')).toBe('aggregator')
  })

  it('ranks a tier-C synced source as linkedin', () => {
    expect(sourceRank('sync:some-linkedin-watcher', 'C')).toBe('linkedin')
  })

  it('treats a synced source with no tier as the least-trusted rank, rather than throwing', () => {
    expect(sourceRank('sync:mystery', null)).toBe('linkedin')
  })

  it('ignores tier entirely for a human source, even if one were somehow passed', () => {
    expect(sourceRank('manual', 'A')).toBe('human')
  })
})

describe('resolveDuplicate', () => {
  it('never enriches a human-authored stored job, whatever the incoming rank', () => {
    expect(resolveDuplicate('employer_site', 'human')).toBe('discard')
    expect(resolveDuplicate('aggregator', 'human')).toBe('discard')
    expect(resolveDuplicate('linkedin', 'human')).toBe('discard')
    // Even a hypothetical incoming 'human' (shouldn't happen -- two human
    // rows wouldn't share a fingerprint check in the first place, but the
    // function itself must not special-case it into an enrich).
    expect(resolveDuplicate('human', 'human')).toBe('discard')
  })

  it('enriches when the incoming source outranks the stored one', () => {
    expect(resolveDuplicate('employer_site', 'aggregator')).toBe('enrich')
    expect(resolveDuplicate('employer_site', 'linkedin')).toBe('enrich')
    expect(resolveDuplicate('aggregator', 'linkedin')).toBe('enrich')
  })

  it('discards when the incoming source ranks equal to the stored one', () => {
    expect(resolveDuplicate('employer_site', 'employer_site')).toBe('discard')
    expect(resolveDuplicate('aggregator', 'aggregator')).toBe('discard')
    expect(resolveDuplicate('linkedin', 'linkedin')).toBe('discard')
  })

  it('discards when the incoming source ranks lower than the stored one', () => {
    expect(resolveDuplicate('linkedin', 'employer_site')).toBe('discard')
    expect(resolveDuplicate('aggregator', 'employer_site')).toBe('discard')
    expect(resolveDuplicate('linkedin', 'aggregator')).toBe('discard')
  })

  it('a human incoming posting outranks every synced stored rank', () => {
    // Not the real-world path (a human posting is written by an admin, not
    // synced), but the ordering itself should still hold if it ever occurs.
    expect(resolveDuplicate('human', 'employer_site')).toBe('enrich')
    expect(resolveDuplicate('human', 'aggregator')).toBe('enrich')
    expect(resolveDuplicate('human', 'linkedin')).toBe('enrich')
  })
})
