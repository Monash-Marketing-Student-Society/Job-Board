import { describe, it, expect } from 'vitest'
import { findJobPosting, mapJobPostingToData, extractJsonLd, extractEmbeddedState } from './extract'

// The first automated coverage this logic has had -- it lived in
// app/api/prefill-job/route.ts (outside vitest's lib/**/*.test.ts scope)
// from when it was written until this move. Verified byte-identical against
// the pre-move route.ts when moved (not re-derived from a spec), so this
// suite's job is to lock in the actual existing behaviour, not to assert
// what the behaviour "should" be.

describe('findJobPosting', () => {
  it('finds a bare JobPosting node', () => {
    const data = { '@type': 'JobPosting', title: 'Marketing Coordinator' }
    expect(findJobPosting(data)).toEqual(data)
  })

  it('finds a JobPosting nested in an @graph array', () => {
    const posting = { '@type': 'JobPosting', title: 'Brand Manager' }
    const data = { '@graph': [{ '@type': 'WebPage' }, posting] }
    expect(findJobPosting(data)).toEqual(posting)
  })

  it('finds a JobPosting inside a top-level array', () => {
    const posting = { '@type': 'JobPosting', title: 'Events Coordinator' }
    expect(findJobPosting([{ '@type': 'Organization' }, posting])).toEqual(posting)
  })

  it('returns null when nothing is a JobPosting', () => {
    expect(findJobPosting({ '@type': 'Organization' })).toBeNull()
    expect(findJobPosting(null)).toBeNull()
    expect(findJobPosting('not an object')).toBeNull()
    expect(findJobPosting(42)).toBeNull()
  })
})

describe('mapJobPostingToData', () => {
  it('reads title, company and logo from a complete node', () => {
    const result = mapJobPostingToData({
      title: 'Marketing Graduate',
      hiringOrganization: { name: 'Unilever', logo: { url: 'https://example.com/logo.png' } },
    })
    expect(result.title).toBe('Marketing Graduate')
    expect(result.company).toBe('Unilever')
    expect(result.company_logo_url).toBe('https://example.com/logo.png')
  })

  it('accepts a string logo directly, not only a logo object', () => {
    const result = mapJobPostingToData({
      hiringOrganization: { name: 'Unilever', logo: 'https://example.com/logo.png' },
    })
    expect(result.company_logo_url).toBe('https://example.com/logo.png')
  })

  it('prefers validThrough over applicationDeadline for the closing date', () => {
    const result = mapJobPostingToData({
      validThrough: '2026-12-01T00:00:00Z',
      applicationDeadline: '2026-11-01T00:00:00Z',
    })
    expect(result.closing_at).toBe('2026-12-01')
  })

  it('falls back to applicationDeadline when validThrough is absent', () => {
    const result = mapJobPostingToData({ applicationDeadline: '2026-11-01T00:00:00Z' })
    expect(result.closing_at).toBe('2026-11-01')
  })

  it('extracts location from a structured address', () => {
    const result = mapJobPostingToData({
      jobLocation: { address: { addressLocality: 'Melbourne', addressRegion: 'VIC', addressCountry: 'AU' } },
    })
    expect(result.location).toBe('Melbourne, VIC, AU')
  })

  it('extracts location from an array of jobLocation entries, taking the first', () => {
    const result = mapJobPostingToData({
      jobLocation: [
        { address: { addressLocality: 'Melbourne' } },
        { address: { addressLocality: 'Sydney' } },
      ],
    })
    expect(result.location).toBe('Melbourne')
  })

  it('maps employmentType through normalizeJobType, including the INTERN special case', () => {
    expect(mapJobPostingToData({ employmentType: 'FULL_TIME' }).job_type).toBe('full-time')
    expect(mapJobPostingToData({ employmentType: 'INTERN' }).job_type).toBe('internship')
    expect(mapJobPostingToData({ employmentType: 'CONTRACTOR' }).job_type).toBe('contract')
  })

  it('wraps a plain-text description in a paragraph, but leaves real HTML alone', () => {
    expect(mapJobPostingToData({ description: 'Plain text.' }).description).toBe('<p>Plain text.</p>')
    expect(mapJobPostingToData({ description: '<p>Already HTML.</p>' }).description).toBe('<p>Already HTML.</p>')
  })

  it('derives tags from skills and qualifications, filtered through the closed vocabulary', () => {
    const result = mapJobPostingToData({
      skills: ['Brand strategy', 'Not a real tag'],
      qualifications: 'Digital, Social Media',
    })
    expect(result.tags).toEqual(expect.arrayContaining(['Digital', 'Social Media']))
    expect(result.tags).not.toContain('Not a real tag')
  })

  it('omits every field it cannot find, rather than including it as null or empty', () => {
    const result = mapJobPostingToData({})
    expect(result.title).toBeUndefined()
    expect(result.company).toBeUndefined()
    expect(result.closing_at).toBeUndefined()
    expect(result.tags).toBeUndefined()
  })
})

describe('extractJsonLd', () => {
  it('extracts a JobPosting from a valid <script type="application/ld+json"> block', () => {
    const html = `<html><head><script type="application/ld+json">${JSON.stringify({
      '@type': 'JobPosting',
      title: 'Marketing Graduate',
      hiringOrganization: { name: 'Unilever' },
    })}</script></head></html>`
    const result = extractJsonLd(html)
    expect(result.title).toBe('Marketing Graduate')
    expect(result.company).toBe('Unilever')
  })

  it('skips a malformed JSON-LD block and tries the next one', () => {
    const html = `
      <script type="application/ld+json">{ not valid json }</script>
      <script type="application/ld+json">${JSON.stringify({ '@type': 'JobPosting', title: 'Recovered' })}</script>
    `
    expect(extractJsonLd(html).title).toBe('Recovered')
  })

  it('returns an empty object when the page has no JSON-LD at all', () => {
    expect(extractJsonLd('<html><body>No structured data here.</body></html>')).toEqual({})
  })

  it('returns an empty object when JSON-LD exists but names no JobPosting', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({ '@type': 'Organization', name: 'Acme' })}</script>`
    expect(extractJsonLd(html)).toEqual({})
  })
})

describe('extractEmbeddedState', () => {
  // findJobPosting() only descends into an @graph array or a top-level
  // array -- not arbitrary nested properties (props.job.*, say). A real
  // __NEXT_DATA__ payload puts its JobPosting at the root or under @graph,
  // matching how this is actually reachable, not an arbitrarily nested shape.
  it('extracts from __NEXT_DATA__ when the JobPosting is the root node', () => {
    const state = { '@type': 'JobPosting', title: 'Graduate Program' }
    const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(state)}</script>`
    expect(extractEmbeddedState(html).title).toBe('Graduate Program')
  })

  it('does not find a JobPosting nested under an arbitrary property -- only @graph or a top-level array', () => {
    const state = { props: { job: { '@type': 'JobPosting', title: 'Unreachable' } } }
    const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(state)}</script>`
    expect(extractEmbeddedState(html)).toEqual({})
  })

  it('does not attempt to parse __NEXT_DATA__ that carries no JobPosting @type at all', () => {
    // The pre-check regex is a quick reject before JSON.parse + tree search --
    // this locks in that this state shape yields nothing, not a crash.
    const state = { props: { page: 'home' } }
    const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(state)}</script>`
    expect(extractEmbeddedState(html)).toEqual({})
  })

  it('extracts from a window.__INITIAL_STATE__ assignment', () => {
    const state = { '@type': 'JobPosting', title: 'From window state' }
    const html = `<script>window.__INITIAL_STATE__ = ${JSON.stringify(state)};</script>`
    expect(extractEmbeddedState(html).title).toBe('From window state')
  })

  it('returns an empty object when none of the known patterns match', () => {
    expect(extractEmbeddedState('<html><body>Nothing here.</body></html>')).toEqual({})
  })
})
