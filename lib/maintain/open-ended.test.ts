import { describe, expect, it } from 'vitest'
import { goneFromFeed, openEndedExpired, pageSaysClosed, readTextCapped, type SourceRun } from './open-ended'

describe('pageSaysClosed', () => {
  const closed = [
    '<h2>No longer accepting applications</h2>',
    '<p>This job is no longer available.</p>',
    '<div>Sorry, this position has been filled</div>',
    '<p>The role you’re looking for is no longer advertised</p>',
    '<p>Applications have closed</p>',
    '<p>Applications for this role are now closed.</p>',
    '<span>This job posting has expired</span>',
    '<p>This vacancy has closed</p>',
  ]
  for (const html of closed) {
    it(`closed: ${html}`, () => expect(pageSaysClosed(`<html><body>${html}</body></html>`)).not.toBeNull())
  }

  const open = [
    '<p>Applications close on 30 November 2026</p>',
    '<p>Closing date: 30/11/2026</p>',
    '<p>We are accepting applications for our graduate program</p>',
    '<p>Apply now — this role is open to graduates</p>',
    // Script and style text isn't what a visitor reads.
    '<script>var msg = "This job is no longer available"</script><p>Apply now</p>',
  ]
  for (const html of open) {
    it(`open: ${html}`, () => expect(pageSaysClosed(html)).toBeNull())
  }
})

describe('openEndedExpired', () => {
  const now = new Date('2026-12-10T00:00:00Z')
  it('expires 60 days after creation', () => {
    expect(openEndedExpired({ created_at: '2026-10-11T00:00:00Z', expired_at: null }, now)).toBe(true)
    expect(openEndedExpired({ created_at: '2026-10-12T00:00:00Z', expired_at: null }, now)).toBe(false)
  })
  it('counts from the last take-down when a job was re-listed', () => {
    expect(openEndedExpired({ created_at: '2026-01-01T00:00:00Z', expired_at: '2026-11-01T00:00:00Z' }, now)).toBe(false)
  })
})

describe('goneFromFeed', () => {
  const run = (started_at: string, extra: Partial<SourceRun> = {}): SourceRun => ({
    started_at,
    finished_at: started_at,
    error: null,
    zero_guard_tripped: false,
    ...extra,
  })
  const lastSeen = '2026-10-05T02:00:00Z'

  it('needs two clean runs since the posting was last seen', () => {
    expect(goneFromFeed(lastSeen, [run('2026-10-06T02:00:00Z')])).toBe(false)
    expect(goneFromFeed(lastSeen, [run('2026-10-06T02:00:00Z'), run('2026-10-07T02:00:00Z')])).toBe(true)
  })

  it('ignores runs that errored, never finished, or tripped the zero guard', () => {
    const runs = [
      run('2026-10-06T02:00:00Z', { error: 'timeout' }),
      run('2026-10-07T02:00:00Z', { zero_guard_tripped: true }),
      run('2026-10-08T02:00:00Z', { finished_at: null }),
      run('2026-10-09T02:00:00Z'),
    ]
    expect(goneFromFeed(lastSeen, runs)).toBe(false)
  })

  it('ignores runs from before it was last seen, and a job with no fingerprint', () => {
    expect(goneFromFeed(lastSeen, [run('2026-10-04T02:00:00Z'), run('2026-10-05T01:00:00Z')])).toBe(false)
    expect(goneFromFeed(null, [run('2026-10-06T02:00:00Z'), run('2026-10-07T02:00:00Z')])).toBe(false)
  })
})

describe('readTextCapped', () => {
  it('stops reading past the cap', async () => {
    const text = await readTextCapped(new Response('x'.repeat(100_000)), 10)
    expect(text.length).toBeLessThan(100_000)
  })
})
