import { describe, it, expect } from 'vitest'
import {
  FILTERED_MAX_LIMIT,
  FILTERED_PAGE_SIZE,
  cleanSearch,
  filteredHref,
  parseFilteredParams,
  searchFilter,
} from './filtered-query'

describe('cleanSearch', () => {
  it('keeps the characters a title or company uses', () => {
    expect(cleanSearch("  Fox ESS  ")).toBe('Fox ESS')
    expect(cleanSearch("P&G Women's Health")).toBe("P&G Women's Health")
    expect(cleanSearch('Nestlé')).toBe('Nestlé')
  })

  it('drops what would break the or-filter or act as a wildcard', () => {
    expect(cleanSearch('a,b(c)"d"%e_f*')).toBe('a b c d e f')
  })

  it('caps the length', () => {
    expect(cleanSearch('x'.repeat(500))).toHaveLength(100)
  })
})

describe('parseFilteredParams', () => {
  it('defaults to everything, first page', () => {
    expect(parseFilteredParams({})).toEqual({ q: '', rule: null, limit: FILTERED_PAGE_SIZE })
  })

  it('reads a known rule and ignores an unknown one', () => {
    expect(parseFilteredParams({ rule: 'experience_required' }).rule).toBe('experience_required')
    expect(parseFilteredParams({ rule: 'drop table' }).rule).toBeNull()
  })

  it('clamps the limit', () => {
    expect(parseFilteredParams({ limit: '600' }).limit).toBe(600)
    expect(parseFilteredParams({ limit: '5' }).limit).toBe(FILTERED_PAGE_SIZE)
    expect(parseFilteredParams({ limit: '999999' }).limit).toBe(FILTERED_MAX_LIMIT)
    expect(parseFilteredParams({ limit: 'abc' }).limit).toBe(FILTERED_PAGE_SIZE)
  })

  it('takes the first of a repeated param', () => {
    expect(parseFilteredParams({ q: ['YouTrip', 'x'] }).q).toBe('YouTrip')
  })
})

describe('searchFilter', () => {
  it('is null without a search', () => {
    expect(searchFilter('')).toBeNull()
  })

  it('matches title or company, quoted', () => {
    expect(searchFilter('Fox ESS')).toBe('normalised->>title.ilike."*Fox ESS*",normalised->>company.ilike."*Fox ESS*"')
  })
})

describe('filteredHref', () => {
  it('leaves defaults out', () => {
    expect(filteredHref({ q: '', rule: null, limit: FILTERED_PAGE_SIZE })).toBe('/admin/filters')
  })

  it('carries search, rule and a bigger page', () => {
    expect(filteredHref({ q: 'Fox ESS', rule: 'experience_required', limit: 600 })).toBe(
      '/admin/filters?q=Fox+ESS&rule=experience_required&limit=600'
    )
  })
})
