import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import dns from 'dns/promises'
import { isPrivateIp, fetchPublicUrl } from './ssrf'

vi.mock('dns/promises', () => ({
  default: { lookup: vi.fn() },
}))

describe('isPrivateIp — IPv4', () => {
  it('blocks loopback and the unspecified range', () => {
    expect(isPrivateIp('127.0.0.1')).toBe(true)
    expect(isPrivateIp('127.99.99.99')).toBe(true)
    // 0.0.0.0 routes to localhost on Linux — the old guard allowed it.
    expect(isPrivateIp('0.0.0.0')).toBe(true)
    expect(isPrivateIp('0.1.2.3')).toBe(true)
  })

  it('blocks RFC1918 private ranges', () => {
    expect(isPrivateIp('10.0.0.1')).toBe(true)
    expect(isPrivateIp('192.168.1.1')).toBe(true)
    expect(isPrivateIp('172.16.0.1')).toBe(true)
    expect(isPrivateIp('172.31.255.255')).toBe(true)
  })

  it('allows the public addresses either side of 172.16.0.0/12', () => {
    expect(isPrivateIp('172.15.255.255')).toBe(false)
    expect(isPrivateIp('172.32.0.1')).toBe(false)
  })

  it('blocks cloud instance metadata', () => {
    expect(isPrivateIp('169.254.169.254')).toBe(true)
  })

  it('blocks carrier-grade NAT, which the old guard allowed', () => {
    expect(isPrivateIp('100.64.0.1')).toBe(true)
    expect(isPrivateIp('100.127.255.255')).toBe(true)
    expect(isPrivateIp('100.63.255.255')).toBe(false) // just outside
    expect(isPrivateIp('100.128.0.1')).toBe(false)
  })

  it('blocks protocol-assignment, benchmarking, multicast and reserved', () => {
    expect(isPrivateIp('192.0.0.1')).toBe(true)
    expect(isPrivateIp('192.0.2.1')).toBe(true)
    expect(isPrivateIp('198.18.0.1')).toBe(true)
    expect(isPrivateIp('224.0.0.1')).toBe(true)
    expect(isPrivateIp('255.255.255.255')).toBe(true)
  })

  it('allows ordinary public addresses', () => {
    expect(isPrivateIp('1.1.1.1')).toBe(false)
    expect(isPrivateIp('8.8.8.8')).toBe(false)
    expect(isPrivateIp('93.184.216.34')).toBe(false)
  })

  it('treats anything unparseable as blocked rather than allowed', () => {
    expect(isPrivateIp('')).toBe(true)
    expect(isPrivateIp('not-an-ip')).toBe(true)
    expect(isPrivateIp('1.2.3')).toBe(true)
    expect(isPrivateIp('999.1.1.1')).toBe(true)
    expect(isPrivateIp('1.2.3.4.5')).toBe(true)
  })
})

describe('isPrivateIp — IPv6', () => {
  // The old guard returned false for every one of these: it bailed out of
  // anything that did not split into four dot-separated parts, so only a
  // literal "::1" was ever caught.
  it('blocks loopback and unspecified', () => {
    expect(isPrivateIp('::1')).toBe(true)
    expect(isPrivateIp('::')).toBe(true)
  })

  it('blocks link-local', () => {
    expect(isPrivateIp('fe80::1')).toBe(true)
    expect(isPrivateIp('fe80::1%eth0')).toBe(true) // zone index stripped
    expect(isPrivateIp('FE80::1')).toBe(true) // case-insensitive
  })

  it('blocks unique-local and multicast', () => {
    expect(isPrivateIp('fc00::1')).toBe(true)
    expect(isPrivateIp('fd12:3456::1')).toBe(true)
    expect(isPrivateIp('ff02::1')).toBe(true)
  })

  it('blocks IPv4-mapped forms of private addresses', () => {
    expect(isPrivateIp('::ffff:127.0.0.1')).toBe(true)
    expect(isPrivateIp('::ffff:169.254.169.254')).toBe(true)
    expect(isPrivateIp('::ffff:10.0.0.1')).toBe(true)
  })

  it('blocks other embedded IPv4 notations rather than trying to parse them', () => {
    expect(isPrivateIp('::ffff:7f00:1')).toBe(true)
    expect(isPrivateIp('::127.0.0.1')).toBe(true)
  })

  it('allows public IPv6', () => {
    expect(isPrivateIp('2606:4700:4700::1111')).toBe(false)
    expect(isPrivateIp('2001:4860:4860::8888')).toBe(false)
  })
})

// ── redirect following ───────────────────────────────────────────────────────
//
// The actual vulnerability: the old code validated the first hostname and then
// handed the request to fetch with `redirect: 'follow'`, so a public page could
// bounce the server into the internal network unchecked.

const PUBLIC_ADDR = [{ address: '93.184.216.34', family: 4 }]
const METADATA_ADDR = [{ address: '169.254.169.254', family: 4 }]

const OPTS = { timeoutMs: 1000, headers: {} }

function redirectTo(location: string) {
  return new Response(null, { status: 302, headers: { location } })
}

describe('fetchPublicUrl', () => {
  beforeEach(() => {
    vi.mocked(dns.lookup).mockReset()
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches a public URL that does not redirect', async () => {
    vi.mocked(dns.lookup).mockResolvedValue(PUBLIC_ADDR as never)
    vi.mocked(fetch).mockResolvedValue(new Response('<html>ok</html>', { status: 200 }))

    const res = await fetchPublicUrl(new URL('https://public.test/job'), OPTS)
    expect(res).not.toBeNull()
    expect(await res!.text()).toContain('ok')
  })

  it('refuses a URL whose host resolves to a private address', async () => {
    vi.mocked(dns.lookup).mockResolvedValue(METADATA_ADDR as never)

    expect(await fetchPublicUrl(new URL('http://internal.test/'), OPTS)).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('does NOT follow a redirect into the metadata endpoint', async () => {
    vi.mocked(dns.lookup)
      .mockResolvedValueOnce(PUBLIC_ADDR as never)      // the public first hop
      .mockResolvedValueOnce(METADATA_ADDR as never)     // where it points
    vi.mocked(fetch).mockResolvedValueOnce(
      redirectTo('http://169.254.169.254/latest/meta-data/')
    )

    expect(await fetchPublicUrl(new URL('https://public.test/job'), OPTS)).toBeNull()
    // Fetched the first hop, then stopped — the second was never requested.
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('rejects a host that resolves to both a public and a private address', async () => {
    vi.mocked(dns.lookup).mockResolvedValue([...PUBLIC_ADDR, ...METADATA_ADDR] as never)

    expect(await fetchPublicUrl(new URL('https://split.test/'), OPTS)).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('follows a redirect that stays public', async () => {
    vi.mocked(dns.lookup).mockResolvedValue(PUBLIC_ADDR as never)
    vi.mocked(fetch)
      .mockResolvedValueOnce(redirectTo('https://public.test/final'))
      .mockResolvedValueOnce(new Response('<html>final</html>', { status: 200 }))

    const res = await fetchPublicUrl(new URL('https://public.test/start'), OPTS)
    expect(await res!.text()).toContain('final')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('gives up rather than looping on a redirect chain', async () => {
    vi.mocked(dns.lookup).mockResolvedValue(PUBLIC_ADDR as never)
    vi.mocked(fetch).mockResolvedValue(redirectTo('https://public.test/again'))

    expect(await fetchPublicUrl(new URL('https://public.test/start'), OPTS)).toBeNull()
    expect(vi.mocked(fetch).mock.calls.length).toBeLessThanOrEqual(4)
  })

  it('refuses a non-http scheme in a Location header', async () => {
    vi.mocked(dns.lookup).mockResolvedValue(PUBLIC_ADDR as never)
    vi.mocked(fetch).mockResolvedValueOnce(redirectTo('file:///etc/passwd'))

    expect(await fetchPublicUrl(new URL('https://public.test/job'), OPTS)).toBeNull()
  })
})
