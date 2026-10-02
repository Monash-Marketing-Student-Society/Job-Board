import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import dns from 'dns/promises'
import { checkConsent, hasExplicitConsent, isPathAllowed, rulesFor } from './robots'
import type { SourceRow } from './adapters/types'

vi.mock('dns/promises', () => ({ default: { lookup: vi.fn() } }))

/** Real robots.txt files from the four live sources' hosts, saved 2 Oct 2026. */
const real = (name: string) => readFileSync(join(__dirname, '__fixtures__', `robots-${name}.txt`), 'utf8')

describe('isPathAllowed against the live sources (real robots.txt)', () => {
  it('Unilever allows its early-careers site', () => {
    expect(isPathAllowed(real('unilever'), '/Unilever_Early_Careers/')).toBe(true)
  })

  it('P&G allows site 1000', () => {
    expect(isPathAllowed(real('pg'), '/1000/')).toBe(true)
  })

  it('Mars disallows its External site but allows ExternalPrivate1', () => {
    expect(isPathAllowed(real('mars'), '/External/')).toBe(false)
    expect(isPathAllowed(real('mars'), '/ExternalPrivate1/')).toBe(true)
  })

  it('Greenhouse allows the board API path and blocks only /embed/', () => {
    expect(isPathAllowed(real('greenhouse-api'), '/v1/boards/ogilvyaus/jobs')).toBe(true)
    expect(isPathAllowed(real('greenhouse-api'), '/embed/job_board')).toBe(false)
  })
})

describe('isPathAllowed rules (RFC 9309)', () => {
  it('no robots rules means allowed', () => {
    expect(isPathAllowed('', '/anything')).toBe(true)
    expect(isPathAllowed('User-agent: *\nDisallow:\n', '/anything')).toBe(true)
  })

  it('the longest matching rule wins, and Allow wins a tie', () => {
    const txt = 'User-agent: *\nDisallow: /jobs/\nAllow: /jobs/public/\n'
    expect(isPathAllowed(txt, '/jobs/public/1')).toBe(true)
    expect(isPathAllowed(txt, '/jobs/private/1')).toBe(false)
    expect(isPathAllowed('User-agent: *\nDisallow: /a\nAllow: /a\n', '/a')).toBe(true)
  })

  it('supports * and a trailing $', () => {
    const txt = 'User-agent: *\nDisallow: /*.pdf$\nDisallow: /tmp*/x\n'
    expect(isPathAllowed(txt, '/files/a.pdf')).toBe(false)
    expect(isPathAllowed(txt, '/files/a.pdf?v=1')).toBe(true)
    expect(isPathAllowed(txt, '/tmp123/x')).toBe(false)
  })

  it('a group naming our product token replaces the * group', () => {
    const txt = 'User-agent: *\nDisallow: /\n\nUser-agent: MMSSJobBoard\nAllow: /careers/\nDisallow: /\n'
    expect(isPathAllowed(txt, '/careers/x')).toBe(true)
    expect(isPathAllowed(txt, '/other')).toBe(false)
    expect(rulesFor(txt)).toHaveLength(2)
  })

  it('consecutive user-agent lines share one group; other agents are ignored', () => {
    const txt = 'User-agent: Googlebot\nUser-agent: *\nDisallow: /private/\n\nUser-agent: Bingbot\nDisallow: /\n'
    expect(isPathAllowed(txt, '/private/x')).toBe(false)
    expect(isPathAllowed(txt, '/public')).toBe(true)
  })

  it('ignores comments', () => {
    expect(isPathAllowed('User-agent: * # all\nDisallow: /x # not this\n', '/x')).toBe(false)
  })
})

const SOURCE: SourceRow = {
  id: 's',
  slug: 'mars',
  name: 'Mars',
  tier: 'A',
  adapter: 'ats',
  endpoint: 'https://mars.wd3.myworkdayjobs.com/wday/cxs/mars/External',
  config: { vendor: 'workday' },
}
const TARGET = new URL('https://mars.wd3.myworkdayjobs.com/External/')

describe('checkConsent', () => {
  beforeEach(() => {
    vi.mocked(dns.lookup).mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never)
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => vi.unstubAllGlobals())

  it('fails a source whose employer disallows its site, naming the path', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(real('mars'), { status: 200 }))
    const result = await checkConsent(SOURCE, TARGET)
    expect(result.ok).toBe(false)
    expect(!result.ok && result.reason).toMatch(/disallows \/External\//)
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toBe('https://mars.wd3.myworkdayjobs.com/robots.txt')
  })

  it('explicit consent skips the robots.txt request entirely', async () => {
    const consented = { ...SOURCE, config: { vendor: 'workday', consent: { type: 'explicit', recorded_at: '2026-10-02' } } }
    expect(await checkConsent(consented, TARGET)).toEqual({ ok: true, basis: 'explicit' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('allows when robots.txt allows', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(real('unilever'), { status: 200 }))
    const unilever = new URL('https://unilever.wd3.myworkdayjobs.com/Unilever_Early_Careers/')
    expect(await checkConsent(SOURCE, unilever)).toEqual({ ok: true, basis: 'robots' })
  })

  it('treats a missing robots.txt (4xx) as no restriction', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('not found', { status: 404 }))
    expect(await checkConsent(SOURCE, TARGET)).toEqual({ ok: true, basis: 'robots' })
  })

  it('fails, rather than guessing, when robots.txt is unreachable (5xx)', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('down', { status: 503 }))
    const result = await checkConsent(SOURCE, TARGET)
    expect(!result.ok && result.reason).toMatch(/could not be read \(HTTP 503\)/)
  })
})

describe('hasExplicitConsent', () => {
  it('needs type explicit, nothing looser', () => {
    expect(hasExplicitConsent({ ...SOURCE, config: { consent: { type: 'explicit' } } })).toBe(true)
    expect(hasExplicitConsent({ ...SOURCE, config: { consent: true } })).toBe(false)
    expect(hasExplicitConsent({ ...SOURCE, config: {} })).toBe(false)
  })
})
