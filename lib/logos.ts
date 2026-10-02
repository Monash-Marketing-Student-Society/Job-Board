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

/**
 * Brandfetch Brand Search: company name -> candidate brands, for the logo
 * suggestions on the submit and admin job forms.
 *
 * Brandfetch's terms allow this API only as autocomplete, called from the
 * user's browser, with results not cached or stored. So it is fetched
 * client-side, and what we keep is never the search result itself -- only the
 * logo URL rebuilt from the chosen domain (`brandfetchLogoUrl`), which is a
 * Logo API hotlink. (The `icon` URLs in search results expire after 24h.)
 */
export interface BrandMatch {
  name: string
  domain: string
  verified: boolean
  /** Brandfetch's 0-1 data quality score. */
  quality: number
}

export const BRAND_SEARCH_MAX = 4

export function brandSearchUrl(company: string): string {
  return `https://api.brandfetch.io/v2/search/${encodeURIComponent(company.trim())}?c=${BRANDFETCH_CLIENT_ID}`
}

/** Defensive parse: the response is third-party JSON, so keep only well-formed rows with a usable domain. */
export function parseBrandSearch(json: unknown): BrandMatch[] {
  if (!Array.isArray(json)) return []
  const seen = new Set<string>()
  const out: BrandMatch[] = []
  for (const item of json) {
    if (!item || typeof item !== 'object') continue
    const r = item as Record<string, unknown>
    const domain = typeof r.domain === 'string' ? normaliseDomain(r.domain) : null
    if (!domain || seen.has(domain)) continue
    seen.add(domain)
    out.push({
      name: typeof r.name === 'string' && r.name.trim() ? r.name.trim() : domain,
      domain,
      verified: r.verified === true,
      quality: typeof r.qualityScore === 'number' ? r.qualityScore : 0,
    })
    if (out.length === BRAND_SEARCH_MAX) break
  }
  return out
}

/** Case, punctuation and legal suffixes don't make a different company: "Mars, Inc." is "mars". */
export function comparableName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(pty|ltd|limited|inc|incorporated|llc|plc|co|corp|corporation)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const AUTO_MIN_QUALITY = 0.85

/**
 * The one match safe to apply without a click, or null. Deliberately strict --
 * a wrong logo on a live listing is worse than none, and names collide ("Bain"
 * is three firms; "Commonwealth Bank" also matches a US credit union). Needs
 * an exact name match on a verified, good-quality brand, and no second
 * verified brand under the same name.
 */
export function autoMatch(company: string, matches: BrandMatch[]): BrandMatch | null {
  const wanted = comparableName(company)
  if (!wanted) return null
  const same = matches.filter((m) => m.verified && comparableName(m.name) === wanted)
  if (same.length !== 1) return null
  return same[0].quality >= AUTO_MIN_QUALITY ? same[0] : null
}

const BRANDFETCH_SITE_HOSTS = new Set(['brandfetch.com', 'www.brandfetch.com'])
const BRANDFETCH_CDN_HOST = 'cdn.brandfetch.io'

/**
 * What an admin pastes when a suggested logo is wrong, turned into a logo URL
 * that carries our client ID. Accepts:
 *   - a bare domain                          (ogilvy.com)
 *   - a Brandfetch brand page                (https://brandfetch.com/ogilvy.com)
 *   - a Logo API link by domain              (https://cdn.brandfetch.io/ogilvy.com?c=...)
 *   - an asset link copied off Brandfetch    (https://cdn.brandfetch.io/id-0D6OFrq/theme/dark/idGIofJnQn.svg?c=...)
 * The last kind names one specific logo file rather than a domain, so it is
 * kept as that file with its query replaced by our ID (someone else's `c=`
 * would bill their quota and can be revoked). Anything else is null: only
 * Brandfetch-hosted logos go through this page.
 */
export function parseBrandfetchInput(input: string): { logoUrl: string; domain: string | null } | null {
  const raw = input.trim()
  if (!raw) return null

  if (!/^https?:\/\//i.test(raw)) {
    const domain = normaliseDomain(raw)
    return domain && !raw.includes('/') ? { logoUrl: brandfetchLogoUrl(domain)!, domain } : null
  }

  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  const host = url.hostname.toLowerCase()
  const segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)

  if (BRANDFETCH_SITE_HOSTS.has(host)) {
    const domain = normaliseDomain(segments[0])
    return domain ? { logoUrl: brandfetchLogoUrl(domain)!, domain } : null
  }

  if (host !== BRANDFETCH_CDN_HOST || segments.length === 0) return null

  const named = segments[0] === 'domain' ? segments[1] : segments[0]
  const domain = named && named.includes('.') ? normaliseDomain(named) : null
  if (domain) return { logoUrl: brandfetchLogoUrl(domain)!, domain }

  // A Brandfetch brand/asset id (they start "id"): keep the file, swap in our ID.
  if (!/^id[A-Za-z0-9_-]+$/.test(segments[0])) return null
  return {
    logoUrl: `https://${BRANDFETCH_CDN_HOST}/${segments.map(encodeURIComponent).join('/')}?c=${BRANDFETCH_CLIENT_ID}`,
    domain: null,
  }
}

/**
 * Hosts whose links are pages, not images. Someone pasting a company's
 * Facebook or LinkedIn page means "use its logo", but the URL is HTML, so it
 * would render as a broken image.
 */
const PAGE_HOSTS = /(^|\.)(facebook\.com|instagram\.com|linkedin\.com|x\.com|twitter\.com|tiktok\.com|youtube\.com)$/

/** An image link expiring sooner than this is refused: it would break on the board within weeks. */
export const MIN_LINK_LIFETIME_DAYS = 30

export interface ParsedLogo {
  logoUrl: string
  domain: string | null
  /** When a signed CDN link stops working, if it says; null = no known expiry. */
  expiresAt: Date | null
}

export type LogoInputResult = { ok: true; logo: ParsedLogo } | { ok: false; reason: string }

/**
 * When a signed social-CDN image link expires. LinkedIn's media.licdn.com
 * carries `e=` in Unix seconds; Facebook and Instagram (fbcdn.net,
 * cdninstagram.com) carry `oe=` in hex seconds.
 */
export function linkExpiry(url: URL): Date | null {
  const host = url.hostname.toLowerCase()
  if (host.endsWith('licdn.com')) {
    const e = Number(url.searchParams.get('e'))
    return Number.isFinite(e) && e > 0 ? new Date(e * 1000) : null
  }
  if (host.endsWith('fbcdn.net') || host.endsWith('cdninstagram.com')) {
    const oe = url.searchParams.get('oe')
    const seconds = oe && /^[0-9a-f]+$/i.test(oe) ? parseInt(oe, 16) : NaN
    return Number.isFinite(seconds) ? new Date(seconds * 1000) : null
  }
  return null
}

/**
 * What an admin pastes on /admin/logos: any Brandfetch form (see
 * parseBrandfetchInput), or a direct https link to an image anywhere -- a
 * LinkedIn or Google Play logo, or our own storage bucket after an upload.
 * Refuses pages (a Facebook profile URL) and signed links that expire within
 * MIN_LINK_LIFETIME_DAYS; those should be uploaded instead.
 */
export function parseLogoInput(input: string, now: Date = new Date()): LogoInputResult {
  const brandfetch = parseBrandfetchInput(input)
  if (brandfetch) return { ok: true, logo: { ...brandfetch, expiresAt: null } }

  const raw = input.trim()
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { ok: false, reason: 'Paste a link to the logo image, a Brandfetch link, or a domain like ogilvy.com.' }
  }
  if (url.protocol !== 'https:') return { ok: false, reason: 'The image link must start with https://' }
  if (url.hostname === BRANDFETCH_CDN_HOST || BRANDFETCH_SITE_HOSTS.has(url.hostname.toLowerCase())) {
    return { ok: false, reason: 'That Brandfetch link has no domain or logo in it.' }
  }
  if (PAGE_HOSTS.test(url.hostname.toLowerCase())) {
    return {
      ok: false,
      reason: "That's a page, not an image. Right-click the logo, copy the image address and paste that, or save it and upload it.",
    }
  }

  const expiresAt = linkExpiry(url)
  if (expiresAt && expiresAt.getTime() - now.getTime() < MIN_LINK_LIFETIME_DAYS * 86_400_000) {
    const when = expiresAt.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Australia/Melbourne' })
    return {
      ok: false,
      reason: `This link ${expiresAt < now ? 'expired' : 'expires'} on ${when}. Save the image and upload it instead.`,
    }
  }
  return { ok: true, logo: { logoUrl: url.toString(), domain: null, expiresAt } }
}
