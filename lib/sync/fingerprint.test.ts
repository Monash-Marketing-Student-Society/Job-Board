import { describe, it, expect } from 'vitest'
import {
  normaliseTitleForFingerprint,
  computeFingerprint,
  normaliseApplyUrl,
  computeApplyUrlHash,
} from './fingerprint'

describe('normaliseTitleForFingerprint', () => {
  // The TDD's own named example.
  it('collapses "2027 Graduate Program — Melbourne (Full-time)" onto "Graduate Program, Melbourne"', () => {
    const a = normaliseTitleForFingerprint('2027 Graduate Program — Melbourne (Full-time)')
    const b = normaliseTitleForFingerprint('Graduate Program, Melbourne')
    expect(a).toBe(b)
    expect(a).toBe('graduate program melbourne')
  })

  it('strips a standalone year wherever it appears, not only as a prefix', () => {
    expect(normaliseTitleForFingerprint('Graduate Program 2027')).toBe('graduate program')
    expect(normaliseTitleForFingerprint('2027 Intake Graduate Program')).toBe('intake graduate program')
  })

  it('strips only a trailing parenthetical, not one in the middle', () => {
    expect(normaliseTitleForFingerprint('Marketing Graduate (Digital Focus)')).toBe('marketing graduate')
    // A load-bearing parenthetical mid-title is left alone -- removing it
    // would make two different roles collapse onto the same fingerprint.
    expect(normaliseTitleForFingerprint('Marketing (Digital) Graduate Program')).toBe('marketing digital graduate program')
  })

  it('normalises punctuation and collapses whitespace', () => {
    expect(normaliseTitleForFingerprint('Brand & Communications - Graduate')).toBe('brand communications graduate')
    expect(normaliseTitleForFingerprint('  Extra   Spaces  ')).toBe('extra spaces')
  })

  it('does not strip a 4-digit number that is not year-shaped', () => {
    // A req id or similar sitting in a title (rare, but not this function's
    // job to guess at) -- only 19xx/20xx tokens are treated as years.
    expect(normaliseTitleForFingerprint('Graduate Program R-9999')).toBe('graduate program r 9999')
  })
})

describe('computeFingerprint', () => {
  it('is identical for the TDD-named title variants once company and city match', () => {
    const a = computeFingerprint('Unilever', '2027 Graduate Program — Melbourne (Full-time)', 'melbourne')
    const b = computeFingerprint('Unilever', 'Graduate Program, Melbourne', 'melbourne')
    expect(a).toBe(b)
  })

  it('differs when the city differs, even with an identical title', () => {
    const melbourne = computeFingerprint('Unilever', 'Graduate Program', 'melbourne')
    const sydney = computeFingerprint('Unilever', 'Graduate Program', 'sydney')
    expect(melbourne).not.toBe(sydney)
  })

  it('differs when the company differs, even with an identical title and city', () => {
    const a = computeFingerprint('Unilever', 'Graduate Program', 'melbourne')
    const b = computeFingerprint('Nestle', 'Graduate Program', 'melbourne')
    expect(a).not.toBe(b)
  })

  it('is case- and whitespace-insensitive on the company name', () => {
    expect(computeFingerprint('unilever', 'Graduate Program', 'melbourne')).toBe(
      computeFingerprint(' Unilever ', 'Graduate Program', 'melbourne')
    )
  })

  it('produces a stable sha256 hex digest', () => {
    const fp = computeFingerprint('Unilever', 'Graduate Program', 'melbourne')
    expect(fp).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('normaliseApplyUrl', () => {
  it('strips tracking parameters', () => {
    expect(normaliseApplyUrl('https://example.com/careers/123?utm_source=linkedin&utm_medium=social')).toBe(
      'https://example.com/careers/123'
    )
  })

  it('leaves a job-identifying parameter untouched', () => {
    // ?gh_jid= identifies WHICH posting, not how the visitor arrived -- see
    // lib/sync/link.ts's JOB_ID_PARAMS. Stripping this would collapse two
    // different postings on the same generic-looking path onto one hash.
    expect(normaliseApplyUrl('https://example.com/careers?gh_jid=12345&utm_source=x')).toBe(
      'https://example.com/careers?gh_jid=12345'
    )
  })

  it('produces the same result regardless of tracking-parameter order', () => {
    const a = normaliseApplyUrl('https://example.com/job/1?utm_source=a&gh_jid=5&utm_medium=b')
    const b = normaliseApplyUrl('https://example.com/job/1?gh_jid=5&utm_medium=b&utm_source=a')
    expect(a).toBe(b)
  })

  it('lowercases the host but not the path', () => {
    expect(normaliseApplyUrl('https://Example.COM/Careers/Role-Title')).toBe('https://example.com/Careers/Role-Title')
  })

  it('drops a trailing slash, except on the bare root', () => {
    expect(normaliseApplyUrl('https://example.com/careers/123/')).toBe('https://example.com/careers/123')
    expect(normaliseApplyUrl('https://example.com/')).toBe('https://example.com/')
  })

  it('drops a fragment', () => {
    expect(normaliseApplyUrl('https://example.com/careers/123#apply')).toBe('https://example.com/careers/123')
  })

  it('returns the original string unchanged for an unparseable URL, rather than throwing', () => {
    expect(normaliseApplyUrl('not a url')).toBe('not a url')
  })
})

describe('computeApplyUrlHash', () => {
  it('hashes two tracking-parameter variants of the same URL identically', () => {
    const a = computeApplyUrlHash('https://example.com/careers/123?utm_source=linkedin')
    const b = computeApplyUrlHash('https://example.com/careers/123?utm_source=email')
    expect(a).toBe(b)
  })

  it('hashes two different postings differently', () => {
    const a = computeApplyUrlHash('https://example.com/careers/123')
    const b = computeApplyUrlHash('https://example.com/careers/456')
    expect(a).not.toBe(b)
  })

  it('produces a stable sha256 hex digest', () => {
    expect(computeApplyUrlHash('https://example.com/careers/123')).toMatch(/^[0-9a-f]{64}$/)
  })
})
