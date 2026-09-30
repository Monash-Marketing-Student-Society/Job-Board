import { describe, it, expect } from 'vitest'
import { gmailComposeHref, isPastDateInput, PARTNERSHIPS_EMAIL } from './utils'

describe('gmailComposeHref', () => {
  it('composes from the partnerships mailbox', () => {
    const url = new URL(gmailComposeHref('luisa.dawson@lenzo.com.au'))
    expect(url.origin + url.pathname).toBe('https://mail.google.com/mail/')
    expect(url.searchParams.get('authuser')).toBe(PARTNERSHIPS_EMAIL)
    expect(url.searchParams.get('view')).toBe('cm')
    expect(url.searchParams.get('fs')).toBe('1')
    expect(url.searchParams.get('to')).toBe('luisa.dawson@lenzo.com.au')
  })

  // A submitter address is user-supplied: it reaches the href straight from
  // the public /submit form, so anything special to a query string has to
  // survive as data rather than reshaping the URL.
  it('encodes an address that carries query-string syntax', () => {
    const url = new URL(gmailComposeHref('a+b&cc=evil@example.com'))
    expect(url.searchParams.get('to')).toBe('a+b&cc=evil@example.com')
    expect(url.searchParams.get('cc')).toBeNull()
  })
})

describe('isPastDateInput', () => {
  const today = new Date(2026, 8, 30, 15, 0) // 30 Sep 2026, 3pm local

  it('flags a date before today -- the mistyped-year case', () => {
    expect(isPastDateInput('2026-01-30', today)).toBe(true)
    expect(isPastDateInput('2026-09-29', today)).toBe(true)
  })

  it('treats today as still open, whatever the time of day', () => {
    expect(isPastDateInput('2026-09-30', today)).toBe(false)
    expect(isPastDateInput('2026-09-30', new Date(2026, 8, 30, 23, 59))).toBe(false)
  })

  it('does not flag a future date', () => {
    expect(isPastDateInput('2027-01-30', today)).toBe(false)
  })

  it('ignores an empty or malformed value, leaving the required-field check to the form', () => {
    expect(isPastDateInput('', today)).toBe(false)
    expect(isPastDateInput('30/01/2026', today)).toBe(false)
  })
})
