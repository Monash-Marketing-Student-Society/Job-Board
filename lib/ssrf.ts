import dns from 'dns/promises'

/**
 * SSRF protection for fetching attacker-supplied URLs.
 *
 * /api/prefill-job takes a URL from an unauthenticated caller and fetches it
 * server-side, then echoes extracted fields back in the response — so a
 * successful redirect into the internal network is not just reachability, it
 * is data exfiltration.
 *
 * The guard this replaces validated only the first hostname and then called
 * fetch with `redirect: 'follow'`, so a page on a public host could reply
 * `302 -> http://169.254.169.254/latest/meta-data/` and be followed with no
 * further checks. Its IP classifier also returned false for every IPv6 address
 * except a literal `::1`, because it bailed out of anything without four
 * dot-separated parts.
 */

/** Blocked IPv4 ranges. Anything unparseable is treated as blocked, not allowed. */
function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.')
  if (parts.length !== 4) return true

  const nums = parts.map((p) => Number(p))
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true

  const [a, b] = nums

  if (a === 0) return true // 0.0.0.0/8 — "this network"; 0.0.0.0 routes to localhost on Linux
  if (a === 10) return true // 10.0.0.0/8 private
  if (a === 127) return true // loopback
  if (a === 100 && b >= 64 && b <= 127) return true // 100.64.0.0/10 carrier-grade NAT
  if (a === 169 && b === 254) return true // link-local — cloud instance metadata lives here
  if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12 private
  if (a === 192 && b === 0) return true // 192.0.0.0/24 protocol assignments, 192.0.2.0/24 TEST-NET
  if (a === 192 && b === 168) return true // 192.168.0.0/16 private
  if (a === 198 && (b === 18 || b === 19)) return true // 198.18.0.0/15 benchmarking
  if (a >= 224) return true // 224.0.0.0/4 multicast and 240.0.0.0/4 reserved

  return false
}

/** Blocked IPv6 ranges. */
function isPrivateIpv6(ip: string): boolean {
  // Strip any zone index (fe80::1%eth0)
  const addr = ip.toLowerCase().split('%')[0]

  if (addr === '::' || addr === '::1') return true // unspecified, loopback
  if (addr.startsWith('fe8') || addr.startsWith('fe9')) return true // fe80::/10 link-local
  if (addr.startsWith('fea') || addr.startsWith('feb')) return true
  if (addr.startsWith('fc') || addr.startsWith('fd')) return true // fc00::/7 unique local
  if (addr.startsWith('ff')) return true // multicast

  return false
}

/**
 * True when an address must not be fetched.
 *
 * IPv4-mapped IPv6 (`::ffff:169.254.169.254`) is unwrapped and judged as IPv4 —
 * without that, the metadata endpoint is reachable simply by asking for it in
 * the other notation.
 */
export function isPrivateIp(ip: string): boolean {
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip)
  if (mapped) return isPrivateIpv4(mapped[1])

  // Any other mapped/embedded form (::ffff:7f00:1, ::127.0.0.1) is not worth
  // parsing exhaustively — nothing legitimate asks for one.
  if (/^::ffff:/i.test(ip) || /^::\d/.test(ip)) return true

  if (ip.includes(':')) return isPrivateIpv6(ip)
  return isPrivateIpv4(ip)
}

/**
 * Resolve a hostname and require *every* address to be public.
 *
 * `all: true` matters: a host with both a public A record and a private one
 * passes a single-address check about half the time, depending on resolver
 * ordering.
 */
export async function isPublicHostname(hostname: string): Promise<boolean> {
  try {
    const addresses = await dns.lookup(hostname, { all: true })
    if (addresses.length === 0) return false
    return addresses.every((a) => !isPrivateIp(a.address))
  } catch {
    return false
  }
}

const MAX_REDIRECTS = 3

/**
 * Fetch a URL, re-validating the host at every redirect hop.
 *
 * Returns null when the target is not fetchable — blocked host, too many hops,
 * a non-http(s) scheme, or a network error. Callers treat null as "no data"
 * rather than surfacing why, so this cannot be used to probe the network.
 *
 * Residual risk worth naming: DNS is resolved here and again by fetch, so a
 * record with a very short TTL could in principle answer differently between
 * the two (classic rebinding). Eliminating that means connecting to a pinned
 * address with a Host header, which undici does not expose cleanly. Checking
 * every hop against every resolved address narrows the window to something far
 * smaller than the redirect hole this replaces.
 */
export async function fetchPublicUrl(
  initial: URL,
  init: { timeoutMs: number; headers: Record<string, string> }
): Promise<Response | null> {
  let url = initial

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!['http:', 'https:'].includes(url.protocol)) return null
    if (!(await isPublicHostname(url.hostname))) return null

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), init.timeoutMs)

    let res: Response
    try {
      res = await fetch(url.toString(), {
        signal: controller.signal,
        headers: init.headers,
        redirect: 'manual',
      })
    } catch {
      return null
    } finally {
      clearTimeout(timeoutId)
    }

    if (res.status < 300 || res.status >= 400) return res

    const location = res.headers.get('location')
    if (!location) return res

    try {
      url = new URL(location, url) // resolves relative Location headers
    } catch {
      return null
    }
  }

  return null // redirect limit reached
}
