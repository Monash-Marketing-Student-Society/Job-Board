import { describe, it, expect, vi } from 'vitest'
import {
  MAX_AUTO_APPROVE_POSTINGS,
  approveSourceRequest,
  rejectSourceRequest,
  sourceRequestSchema,
} from './source-requests'
import { fakeDb, type Handler, type Op } from './test-helpers/fake-db'

const has = (ops: Op[], name: string) => ops.some((o) => o.name === name)
const argOf = (ops: Op[], name: string) => ops.find((o) => o.name === name)!.args[0] as Record<string, unknown>

const CLAIMED = {
  id: 'req-1',
  company_name: 'Acme Marketing',
  contact_email: 'hr@acme.test',
  detected_vendor: 'greenhouse',
  detected_endpoint: 'https://boards-api.greenhouse.io/v1/boards/acme',
}

function script(over: { claim?: unknown; slugs?: string[]; insert?: unknown; existing?: unknown } = {}): Handler {
  return (table, ops) => {
    if (table === 'source_requests' && has(ops, 'update') && argOf(ops, 'update').status === 'approved')
      return (over.claim as never) ?? { data: CLAIMED }
    if (table === 'sources' && has(ops, 'maybeSingle')) return { data: over.existing ?? null }
    if (table === 'sources' && has(ops, 'like')) return { data: (over.slugs ?? []).map((slug) => ({ slug })) }
    if (table === 'sources' && has(ops, 'insert')) return (over.insert as never) ?? { data: { id: 'src-9' } }
  }
}

const updatesTo = (log: ReturnType<typeof fakeDb>['log'], status: string) =>
  log.filter((c) => c.table === 'source_requests' && has(c.ops, 'update') && argOf(c.ops, 'update').status === status)

describe('sourceRequestSchema', () => {
  const valid = {
    company_name: 'Acme',
    contact_name: 'Sam',
    contact_email: 'sam@acme.test',
    careers_url: 'https://job-boards.greenhouse.io/acme',
    consent: true,
  }

  it('accepts a complete request', () => {
    expect(sourceRequestSchema.safeParse(valid).success).toBe(true)
  })

  it('refuses a request without the consent tick -- there is nothing to record', () => {
    expect(sourceRequestSchema.safeParse({ ...valid, consent: false }).success).toBe(false)
    const { consent: _, ...noConsent } = valid
    expect(sourceRequestSchema.safeParse(noConsent).success).toBe(false)
  })

  it('refuses non-http links and bad emails', () => {
    expect(sourceRequestSchema.safeParse({ ...valid, careers_url: 'javascript:alert(1)' }).success).toBe(false)
    expect(sourceRequestSchema.safeParse({ ...valid, contact_email: 'nope' }).success).toBe(false)
  })
})

describe('approveSourceRequest', () => {
  it('claims only a pending request that has a detected feed', async () => {
    const { db, log } = fakeDb(script())
    await approveSourceRequest(db, 'req-1', 'admin-1', async () => 5)

    const claim = log[0]
    expect(claim.table).toBe('source_requests')
    expect(claim.ops).toContainEqual({ name: 'eq', args: ['status', 'pending'] })
    expect(claim.ops).toContainEqual({ name: 'not', args: ['detected_endpoint', 'is', null] })
    expect(argOf(claim.ops, 'update')).toMatchObject({ status: 'approved', reviewed_by: 'admin-1' })
  })

  it('creates a review-only tier A source carrying explicit consent', async () => {
    const { db, log } = fakeDb(script())
    const result = await approveSourceRequest(db, 'req-1', 'admin-1', async () => 5, '2026-10-02')

    expect(result).toEqual({ ok: true, sourceId: 'src-9', slug: 'acme-marketing', postings: 5, existing: false })
    const insert = argOf(log.find((c) => c.table === 'sources' && has(c.ops, 'insert'))!.ops, 'insert')
    expect(insert).toMatchObject({
      slug: 'acme-marketing',
      name: 'Acme Marketing',
      tier: 'A',
      adapter: 'ats',
      endpoint: CLAIMED.detected_endpoint,
      enabled: true,
      config: {
        vendor: 'greenhouse',
        consent: { type: 'explicit', recorded_at: '2026-10-02', request_id: 'req-1', by: 'hr@acme.test' },
      },
    })
    expect((insert.config as Record<string, unknown>).auto_publish).toBeUndefined()
  })

  it('records consent on the existing source instead of duplicating a feed we already read', async () => {
    const existing = { id: 'src-ogilvy', slug: 'ogilvy', config: { vendor: 'greenhouse' } }
    const { db, log } = fakeDb(script({ existing }))
    const result = await approveSourceRequest(db, 'req-1', 'admin-1', async () => 8, '2026-10-02')

    expect(result).toEqual({ ok: true, sourceId: 'src-ogilvy', slug: 'ogilvy', postings: 8, existing: true })
    expect(log.some((c) => c.table === 'sources' && has(c.ops, 'insert'))).toBe(false)
    const merge = log.find((c) => c.table === 'sources' && has(c.ops, 'update'))!
    expect(argOf(merge.ops, 'update').config).toEqual({
      vendor: 'greenhouse',
      consent: { type: 'explicit', recorded_at: '2026-10-02', request_id: 'req-1', by: 'hr@acme.test' },
    })
    expect(merge.ops).toContainEqual({ name: 'eq', args: ['id', 'src-ogilvy'] })
  })

  it('picks a free slug when the company name is taken', async () => {
    const { db } = fakeDb(script({ slugs: ['acme-marketing', 'acme-marketing-2'] }))
    const result = await approveSourceRequest(db, 'req-1', 'admin-1', async () => 1)
    expect(result.ok && result.slug).toBe('acme-marketing-3')
  })

  it('hands the request back to the queue when the feed does not answer', async () => {
    const { db, log } = fakeDb(script())
    const result = await approveSourceRequest(db, 'req-1', 'admin-1', async () => {
      throw new Error('the Greenhouse board answered HTTP 404')
    })

    expect(result).toEqual({ ok: false, kind: 'probe_failed', message: 'the Greenhouse board answered HTTP 404' })
    expect(updatesTo(log, 'pending')).toHaveLength(1)
    expect(log.some((c) => c.table === 'sources' && has(c.ops, 'insert'))).toBe(false)
  })

  it('refuses one-click approval for a whole global tenant', async () => {
    const { db, log } = fakeDb(script())
    const result = await approveSourceRequest(db, 'req-1', 'admin-1', async () => MAX_AUTO_APPROVE_POSTINGS + 1)

    expect(result.ok).toBe(false)
    expect(!result.ok && result.kind).toBe('too_large')
    expect(updatesTo(log, 'pending')).toHaveLength(1)
  })

  it('hands the request back if the source insert fails', async () => {
    const { db, log } = fakeDb(script({ insert: { error: { message: 'duplicate slug' } } }))
    const result = await approveSourceRequest(db, 'req-1', 'admin-1', async () => 1)
    expect(result).toEqual({ ok: false, kind: 'error', message: 'duplicate slug' })
    expect(updatesTo(log, 'pending')).toHaveLength(1)
  })

  it('is a conflict when nothing was claimed, and never probes', async () => {
    const probe = vi.fn()
    const { db } = fakeDb(script({ claim: { data: null } }))
    expect(await approveSourceRequest(db, 'req-1', 'admin-1', probe)).toEqual({ ok: false, kind: 'conflict' })
    expect(probe).not.toHaveBeenCalled()
  })
})

describe('rejectSourceRequest', () => {
  it('rejects only a pending request', async () => {
    const { db, log } = fakeDb(() => ({ data: [{ id: 'req-1' }] }))
    expect(await rejectSourceRequest(db, 'req-1', 'admin-1')).toEqual({ ok: true })
    expect(log[0].ops).toContainEqual({ name: 'eq', args: ['status', 'pending'] })
  })

  it('is a conflict when it was already actioned', async () => {
    const { db } = fakeDb(() => ({ data: [] }))
    expect(await rejectSourceRequest(db, 'req-1', 'admin-1')).toEqual({ ok: false, kind: 'conflict' })
  })
})
