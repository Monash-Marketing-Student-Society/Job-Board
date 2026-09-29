import { describe, it, expect, vi } from 'vitest'
import { buildDigest, needsDigest, runLabel, sendRunDigest, loadHeldSince, type HeldJob } from './digest'
import { emptyCounts } from './run'
import type { WorkerSummary } from './worker'
import { PARTNERSHIPS_EMAIL } from '../utils'
import { fakeDb } from './test-helpers/fake-db'

const ok = (over: Partial<WorkerSummary> = {}): WorkerSummary => ({
  slug: 'unilever',
  name: 'Unilever',
  counts: { ...emptyCounts(), seen: 16, rejected: 15, held: 1 },
  error: null,
  zeroGuardTripped: false,
  ...over,
})

const HELD: HeldJob = {
  title: 'Unilever Future Leaders Programme – Customer Development (Australia)',
  company: 'Unilever',
  location: 'North Rocks, Sydney, Australia',
  source: 'Unilever',
  reasons: ['classifier_unsure', 'new_adapter', 'review_only_mode'],
}

const RUN = new Date('2026-09-29T16:00:00Z') // 02:00 Wed 30 Sep in Melbourne

describe('needsDigest', () => {
  it('is quiet on a run with nothing held and nothing broken', () => {
    expect(needsDigest([ok({ counts: { ...emptyCounts(), seen: 16, rejected: 16 } })], [])).toBe(false)
  })

  it('sends when anything was held', () => {
    expect(needsDigest([ok()], [HELD])).toBe(true)
  })

  it('sends when a source errored or tripped the zero guard, even with nothing held', () => {
    expect(needsDigest([ok({ error: 'list failed' })], [])).toBe(true)
    expect(needsDigest([ok({ zeroGuardTripped: true })], [])).toBe(true)
  })
})

describe('runLabel', () => {
  it('uses Melbourne time, not the worker machine timezone', () => {
    // 16:00 UTC on the 29th is 02:00 on the 30th in Melbourne.
    expect(runLabel(RUN)).toBe('Wed, 30 Sept')
  })
})

describe('buildDigest', () => {
  it('lists each held job with readable reasons, leaving out the soak-wide one', () => {
    const { text } = buildDigest([ok()], [HELD], 'https://jobs.monashmss.com', RUN)
    expect(text).toContain('Unilever Future Leaders Programme')
    expect(text).toContain('Held: Unsure it fits, New source')
    expect(text).not.toContain('Review-only source')
  })

  it('still gives a reason when the soak is the only one', () => {
    const { text } = buildDigest([ok()], [{ ...HELD, reasons: ['review_only_mode'] }], 'https://x.test', RUN)
    expect(text).toContain('Held: Review-only source')
  })

  it('links to the review queue, trailing slash or not', () => {
    expect(buildDigest([ok()], [HELD], 'https://jobs.monashmss.com/', RUN).text).toContain(
      'https://jobs.monashmss.com/admin/submissions'
    )
  })

  it('summarises the run in the subject', () => {
    expect(buildDigest([ok()], [HELD], 'https://x.test', RUN).subject).toBe('Job sync, Wed, 30 Sept: 1 to review')
    expect(buildDigest([ok({ error: 'boom' })], [], 'https://x.test', RUN).subject).toMatch(/1 source need attention/)
  })

  it('names a broken source and what went wrong', () => {
    const { text } = buildDigest([ok({ error: 'Workday list request failed' })], [], 'https://x.test', RUN)
    expect(text).toContain('Unilever: Run failed: Workday list request failed')
  })

  it('explains a tripped zero guard, including that nothing was expired', () => {
    const { text } = buildDigest([ok({ zeroGuardTripped: true, counts: { ...emptyCounts(), seen: 0 } })], [], 'https://x.test', RUN)
    expect(text).toMatch(/Returned 0 postings, far below usual.*not expired/)
  })

  // Titles are scraped from third-party sites. A hostile one must arrive as
  // text in the email, never as markup.
  it('escapes scraped titles and sources in the HTML', () => {
    const hostile: HeldJob = { ...HELD, title: '<img src=x onerror=alert(1)>Grad', company: 'A & B "Co"' }
    const { html } = buildDigest([ok({ name: '<b>Src</b>' })], [hostile], 'https://x.test', RUN)
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;Grad')
    expect(html).toContain('A &amp; B &quot;Co&quot;')
    expect(html).not.toContain('<b>Src</b>')
  })
})

describe('loadHeldSince', () => {
  it('reads only pending staged jobs created since the run started', async () => {
    const { db, log } = fakeDb(() => ({
      data: [{ normalised: { title: 'T', company: 'C', location: 'Sydney' }, risk_reasons: ['new_adapter'], sources: { name: 'Unilever' } }],
    }))
    const held = await loadHeldSince(db, RUN)

    expect(held).toEqual([{ title: 'T', company: 'C', location: 'Sydney', source: 'Unilever', reasons: ['new_adapter'] }])
    expect(log[0].table).toBe('staged_jobs')
    expect(log[0].ops).toContainEqual({ name: 'eq', args: ['status', 'pending'] })
    expect(log[0].ops).toContainEqual({ name: 'gte', args: ['created_at', RUN.toISOString()] })
  })
})

describe('sendRunDigest', () => {
  const heldDb = () =>
    fakeDb(() => ({
      data: [{ normalised: { title: 'T', company: 'C', location: null }, risk_reasons: ['classifier_unsure'], sources: { name: 'Unilever' } }],
    })).db

  it('does nothing at all when disabled -- a local run must never mail the committee', async () => {
    const send = vi.fn()
    const { db, log } = fakeDb()
    expect(await sendRunDigest(db, [ok()], RUN, { enabled: false, appUrl: 'https://x.test', send })).toBe('skipped_disabled')
    expect(send).not.toHaveBeenCalled()
    expect(log).toHaveLength(0)
  })

  it('sends nothing on a quiet run', async () => {
    const send = vi.fn()
    const { db } = fakeDb(() => ({ data: [] }))
    const quiet = ok({ counts: { ...emptyCounts(), seen: 16, rejected: 16 } })
    expect(await sendRunDigest(db, [quiet], RUN, { enabled: true, appUrl: 'https://x.test', send })).toBe(
      'skipped_nothing_to_report'
    )
    expect(send).not.toHaveBeenCalled()
  })

  it('sends one email to partnerships@ when a job was held', async () => {
    const send = vi.fn().mockResolvedValue({ ok: true })
    expect(await sendRunDigest(heldDb(), [ok()], RUN, { enabled: true, appUrl: 'https://x.test', send })).toBe('sent')

    expect(send).toHaveBeenCalledOnce()
    const msg = send.mock.calls[0][0]
    expect(msg.to).toBe(PARTNERSHIPS_EMAIL)
    expect(msg.subject).toContain('1 to review')
  })

  it('reports a failed send instead of throwing, so the run itself still succeeds', async () => {
    const send = vi.fn().mockResolvedValue({ ok: false, error: 'RESEND_API_KEY is not set' })
    expect(await sendRunDigest(heldDb(), [ok()], RUN, { enabled: true, appUrl: 'https://x.test', send })).toEqual({
      failed: 'RESEND_API_KEY is not set',
    })
  })
})
