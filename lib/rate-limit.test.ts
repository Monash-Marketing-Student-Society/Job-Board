import { describe, it, expect, vi, afterEach } from 'vitest'
import { clientIp, allowSubmission } from './rate-limit'

function req(headers: Record<string, string>): Request {
  return new Request('https://jobs.monashmss.com/api/submit-job', { headers })
}

describe('clientIp', () => {
  it('reads a single x-forwarded-for value', () => {
    expect(clientIp(req({ 'x-forwarded-for': '203.0.113.4' }))).toBe('203.0.113.4')
  })

  it('takes the first entry of a proxy chain', () => {
    expect(clientIp(req({ 'x-forwarded-for': '203.0.113.4, 10.0.0.1, 10.0.0.2' }))).toBe(
      '203.0.113.4'
    )
  })

  it('trims whitespace around the first entry', () => {
    expect(clientIp(req({ 'x-forwarded-for': '  203.0.113.4  , 10.0.0.1' }))).toBe('203.0.113.4')
  })

  it('falls back to x-real-ip when x-forwarded-for is absent', () => {
    expect(clientIp(req({ 'x-real-ip': '198.51.100.7' }))).toBe('198.51.100.7')
  })

  it('falls back to a constant bucket when neither header is present', () => {
    expect(clientIp(req({}))).toBe('unknown')
  })
})

// A minimal stand-in for the one method allowSubmission calls. Casting to
// `any` at the call site rather than typing this against SupabaseClient's
// full generic surface, which this test has no use for.
function mockClient(rpc: (...args: unknown[]) => Promise<{ data: unknown; error: unknown }>) {
  return { rpc: vi.fn(rpc) }
}

describe('allowSubmission', () => {
  it('allows the request when the RPC returns true', async () => {
    const client = mockClient(async () => ({ data: true, error: null }))
    await expect(allowSubmission(client as any, req({}))).resolves.toBe(true)
  })

  it('blocks the request when the RPC returns false', async () => {
    const client = mockClient(async () => ({ data: false, error: null }))
    await expect(allowSubmission(client as any, req({}))).resolves.toBe(false)
  })

  it('fails open when the RPC errors, e.g. migration 0017 not applied yet', async () => {
    const client = mockClient(async () => ({ data: null, error: { message: 'function does not exist' } }))
    await expect(allowSubmission(client as any, req({}))).resolves.toBe(true)
  })

  it('hashes the IP rather than sending it raw', async () => {
    const rpc = vi.fn(async (_fn: string, args: { p_ip_hash: string }) => ({
      data: true,
      error: null,
    }))
    const client = { rpc }
    await allowSubmission(client as any, req({ 'x-forwarded-for': '203.0.113.4' }))
    const [, args] = rpc.mock.calls[0]
    expect(args.p_ip_hash).not.toBe('203.0.113.4')
    expect(args.p_ip_hash).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('IP hash peppering', () => {
  const ORIGINAL_PEPPER = process.env.RATE_LIMIT_HASH_PEPPER

  afterEach(() => {
    if (ORIGINAL_PEPPER === undefined) delete process.env.RATE_LIMIT_HASH_PEPPER
    else process.env.RATE_LIMIT_HASH_PEPPER = ORIGINAL_PEPPER
  })

  async function hashVia(pepper: string | undefined, ip: string): Promise<string> {
    if (pepper === undefined) delete process.env.RATE_LIMIT_HASH_PEPPER
    else process.env.RATE_LIMIT_HASH_PEPPER = pepper
    const rpc = vi.fn(async (_fn: string, args: { p_ip_hash: string }) => ({
      data: true,
      error: null,
    }))
    await allowSubmission({ rpc } as any, req({ 'x-forwarded-for': ip }))
    return rpc.mock.calls[0][1].p_ip_hash
  }

  it('produces a different hash for the same IP under different peppers', async () => {
    const a = await hashVia('pepper-one', '203.0.113.4')
    const b = await hashVia('pepper-two', '203.0.113.4')
    expect(a).not.toBe(b)
  })

  it('is deterministic for the same IP and pepper', async () => {
    const a = await hashVia('pepper-one', '203.0.113.4')
    const b = await hashVia('pepper-one', '203.0.113.4')
    expect(a).toBe(b)
  })

  it('falls back to the plain unsalted hash when no pepper is set, still 64 hex chars', async () => {
    const unpeppered = await hashVia(undefined, '203.0.113.4')
    expect(unpeppered).toMatch(/^[0-9a-f]{64}$/)
    const peppered = await hashVia('pepper-one', '203.0.113.4')
    expect(unpeppered).not.toBe(peppered)
  })
})
