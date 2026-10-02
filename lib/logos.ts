/**
 * Company logos from Brandfetch's Logo API, keyed by the company's domain.
 *
 * The result is a hotlink, stored as-is in jobs.company_logo_url: Brandfetch's
 * terms require the browser to load the image from their CDN (no downloading
 * into our bucket), and a domain-path URL does not expire the way LinkedIn's
 * signed logo URLs do. A domain Brandfetch doesn't know still renders -- the
 * `lettermark` fallback returns a plain initial rather than a broken image.
 *
 * The client ID is public by design (it is in every image URL a visitor's
 * browser requests), so it lives here rather than in env -- that keeps the
 * Trigger.dev worker and Vercel from needing their own copy. It is MMSS's own
 * ID, registered 2 Oct 2026.
 */

export const BRANDFETCH_CLIENT_ID = '1ido3HOcLqD6CO4-TB5'

/**
 * Accepts a bare domain or a URL and returns its hostname without `www.`,
 * or null if it isn't a plausible public domain.
 */
export function normaliseDomain(input: string | null | undefined): string | null {
  if (!input) return null
  let host = input.trim().toLowerCase()
  if (!host) return null
  try {
    host = new URL(host.includes('://') ? host : `https://${host}`).hostname
  } catch {
    return null
  }
  host = host.replace(/^www\./, '')
  // Needs a dot and a letters-only TLD: rules out "localhost", IPs and junk.
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(host)) return null
  return host
}

/** 128px square icon for a domain, or null when there is no usable domain. */
export function brandfetchLogoUrl(domain: string | null | undefined): string | null {
  const host = normaliseDomain(domain)
  if (!host) return null
  return `https://cdn.brandfetch.io/domain/${host}/w/128/h/128/fallback/lettermark/icon?c=${BRANDFETCH_CLIENT_ID}`
}

/** Logo for a sync source, from its `config.domain` (set per employer when the source is seeded). */
export function sourceLogoUrl(config: Record<string, unknown> | null | undefined): string | null {
  const domain = config?.domain
  return typeof domain === 'string' ? brandfetchLogoUrl(domain) : null
}
