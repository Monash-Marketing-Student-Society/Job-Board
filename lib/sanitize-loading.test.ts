import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'

/**
 * Guards a production outage, not sanitizer behaviour (that's sanitize.test.ts).
 *
 * isomorphic-dompurify 4.x pulled in jsdom 30, whose dependencies `require()`
 * an ES-module-only package (@exodus/bytes). Node 22+ allows that, so tests,
 * local builds and the Trigger.dev worker all passed -- but Vercel's function
 * loader doesn't, and every route importing lib/sanitize.ts (the public
 * /api/submit-job form among them) returned 500 on load with ERR_REQUIRE_ESM.
 * No employer submission succeeded from 7 Sep until the dependency was pinned
 * back to isomorphic-dompurify 2.26.0 (jsdom 26).
 *
 * `--no-experimental-require-module` makes Node refuse require(esm) the way
 * Vercel's loader does, so this reproduces the production failure locally.
 */
describe('sanitizer dependency loading', () => {
  it('loads without require(esm), the way Vercel serverless functions load it', () => {
    const out = execFileSync(
      process.execPath,
      [
        '--no-experimental-require-module',
        '-e',
        "const D = require('isomorphic-dompurify'); process.stdout.write(D.sanitize('<p>ok</p><img src=x onerror=alert(1)>'))",
      ],
      { encoding: 'utf8', cwd: process.cwd() }
    )
    expect(out).toContain('<p>ok</p>')
    expect(out).not.toContain('onerror')
  })
})
