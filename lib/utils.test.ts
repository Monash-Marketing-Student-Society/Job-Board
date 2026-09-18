import { describe, it, expect } from 'vitest'
import { gmailComposeHref, PARTNERSHIPS_EMAIL } from './utils'

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
