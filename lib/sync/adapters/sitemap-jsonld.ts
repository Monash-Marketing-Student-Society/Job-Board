/**
 * The sitemap + JSON-LD adapter, for careers sites with no JSON API but
 * whose posting pages carry schema.org `JobPosting` JSON-LD.
 *
 * Verified against the real site on 2 Oct 2026 (careers.myergroup.com.au --
 * 361 postings in /sitemap.xml, every posting page with a JobPosting block
 * carrying title, description, employmentType, validThrough and jobLocation).
 * Fixtures in __fixtures__/jsonld-*.{xml,html} are trimmed from those calls.
 *
 * `sources.endpoint` is the sitemap URL. The sitemap lists every posting but
 * only as a URL, so reading one is N+1 like Workday: one sitemap request,
 * then one page request per posting. Myer's 361 are mostly store and
 * warehouse roles, so two config keys keep the page requests down:
 *   - `config.postings_path` (default `/jobs/`): only sitemap URLs on the
 *     sitemap's host under this path are postings. It is also the path the
 *     consent check reads robots.txt for (lib/sync/vendors.ts).
 *   - `config.url_filter`: a case-insensitive pattern the posting URL must
 *     match. The slug carries the title (`/jobs/expression-of-interest-entry-
 *     level-buying-opportunities-various-locations`), so this is a title
 *     filter applied before any page is fetched.
 * More than MAX_PAGES matching URLs throws instead of quietly fetching
 * hundreds of pages -- the fix is a narrower `url_filter`.
 *
 * Page failures. David Jones and ABC run the same careers platform as Myer
 * but sit behind an AWS WAF bot challenge, which answers every posting page
 * with an empty 202. Only a 200 is read as a page; when every page fails the
 * source throws, so a blocked site records a failed run rather than a quiet
 * zero. One page failing among several is skipped -- a single slow page
 * shouldn't fail the whole employer.
 */

import { fetchPublicUrl } from '../../ssrf'
import { findJobPosting } from '../../prefill/extract'
import { decodeHtmlEntities } from '../../utils'
import type { Adapter, RawPosting, SourceRow } from './types'

const REQUEST_HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; MMSSJobBoard/1.0)' }
const REQUEST_TIMEOUT_MS = 15_000
export const MAX_PAGES = 50
/** A sitemap index may list this many child sitemaps; more throws rather than fanning out. */
export const MAX_CHILD_SITEMAPS = 10
const DEFAULT_POSTINGS_PATH = '/jobs/'

/** `config.postings_path`, defaulting to `/jobs/`. Throws on a malformed value. */
export function postingsPath(source: SourceRow): string {
  const raw = source.config.postings_path
  if (raw === undefined || raw === null) return DEFAULT_POSTINGS_PATH
  if (typeof raw !== 'string' || !raw.startsWith('/')) {
    throw new Error(`Source "${source.slug}" has a malformed config.postings_path: ${JSON.stringify(raw)}`)
  }
  return raw
}

/** `config.url_filter` as a case-insensitive pattern, or null when unset. Throws on an invalid pattern. */
export function urlFilter(source: SourceRow): RegExp | null {
  const raw = source.config.url_filter
  if (raw === undefined || raw === null) return null
  if (typeof raw !== 'string' || !raw) {
    throw new Error(`Source "${source.slug}" has a malformed config.url_filter: ${JSON.stringify(raw)}`)
  }
  try {
    return new RegExp(raw, 'i')
  } catch {
    throw new Error(`Source "${source.slug}" has an invalid config.url_filter pattern: ${raw}`)
  }
}

export function isSitemapIndex(xml: string): boolean {
  return /<sitemapindex[\s>]/i.test(xml)
}

function locs(xml: string): string[] {
  const urls: string[] = []
  for (const m of xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)) {
    urls.push(m[1].replace(/&amp;/g, '&'))
  }
  return urls
}

/** Every `<loc>` in a urlset sitemap, entity-decoded. Throws on an index: those are expanded by the adapter, once. */
export function sitemapUrls(xml: string): string[] {
  if (isSitemapIndex(xml)) {
    throw new Error('sitemap is a sitemap index; point the source at the child sitemap that lists postings')
  }
  return locs(xml)
}

/** The child sitemaps a sitemap index lists, entity-decoded. */
export function sitemapIndexChildren(xml: string): string[] {
  return locs(xml)
}

/** The first JobPosting node in a page's JSON-LD blocks, or null. */
export function jobPostingFromHtml(html: string): Record<string, unknown> | null {
  const scriptRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  for (const m of html.matchAll(scriptRe)) {
    try {
      const found = findJobPosting(JSON.parse(m[1]))
      if (found) return found
    } catch {
      // One malformed block doesn't hide a valid one later on the page.
    }
  }
  return null
}

/** The inner HTML of the element whose opening tag ends at `openEnd`, balancing nested tags of the same name. */
function innerHtml(html: string, openEnd: number, tag: string): string | null {
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi')
  re.lastIndex = openEnd
  let depth = 1
  for (let m = re.exec(html); m; m = re.exec(html)) {
    if (m[0].endsWith('/>')) continue
    depth += m[1] ? -1 : 1
    if (depth === 0) return html.slice(openEnd, m.index)
  }
  return null
}

function textOf(fragment: string): string {
  return decodeHtmlEntities(fragment.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
}

/** An itemprop's value: a `<meta content>`, or the element's inner HTML. */
function itemprop(scope: string, name: string): { content: string | null; html: string | null } | null {
  const m = new RegExp(`<(\\w+)\\b[^>]*\\bitemprop="${name}"[^>]*>`, 'i').exec(scope)
  if (!m) return null
  const content = /\bcontent="([^"]*)"/i.exec(m[0])
  if (content) return { content: decodeHtmlEntities(content[1]), html: null }
  return { content: null, html: innerHtml(scope, m.index + m[0].length, m[1]) }
}

function isoDate(value: string | null): string | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/**
 * A schema.org JobPosting written as **microdata** (itemscope/itemprop
 * attributes) rather than JSON-LD, returned in the JSON-LD shape so the same
 * normaliser reads both. SuccessFactors career sites use this: Deloitte's
 * jobs.deloitte.com.au, verified 2 Oct 2026 -- title, description (nested
 * HTML), datePosted ("Thu Sep 24 16:00:00 UTC 2026", converted to ISO here so
 * it can't reach a timestamp column as raw text), hiringOrganization, and a
 * jobLocation listing several PostalAddresses (one role, five cities).
 *
 * The normaliser uses the first jobLocation, so a Melbourne or Sydney
 * address is moved to the front: the role really is open there, and a role
 * listed "Adelaide; Sydney" would otherwise read as Adelaide and be rejected.
 */
export function jobPostingFromMicrodata(html: string): Record<string, unknown> | null {
  const start = /<(\w+)\b[^>]*\bitemtype="https?:\/\/schema\.org\/JobPosting"[^>]*>/i.exec(html)
  if (!start) return null
  const scope = innerHtml(html, start.index + start[0].length, start[1]) ?? html.slice(start.index)

  const title = itemprop(scope, 'title')
  const titleText = title?.content ?? (title?.html ? textOf(title.html) : '')
  if (!titleText) return null

  const description = itemprop(scope, 'description')
  const addresses: Array<Record<string, string>> = []
  for (const m of scope.matchAll(/itemtype="https?:\/\/schema\.org\/PostalAddress"[^>]*>([\s\S]*?)<\/span>/gi)) {
    const address: Record<string, string> = {}
    for (const meta of m[1].matchAll(/itemprop="(addressLocality|addressRegion|addressCountry|streetAddress)"[^>]*\bcontent="([^"]*)"/gi)) {
      address[meta[1]] = decodeHtmlEntities(meta[2])
    }
    // ANZ's site (same SuccessFactors platform as Deloitte) puts the whole
    // place in streetAddress ("Dunedin, NZ") and sends no locality.
    if (!address.addressLocality && address.streetAddress) address.addressLocality = address.streetAddress
    delete address.streetAddress
    if (Object.keys(address).length > 0) addresses.push(address)
  }
  const target = addresses.findIndex((a) => /\b(melbourne|sydney)\b/i.test(a.addressLocality ?? ''))
  if (target > 0) addresses.unshift(...addresses.splice(target, 1))

  const meta = (name: string) => {
    const v = itemprop(scope, name)
    return v?.content ?? (v?.html ? textOf(v.html) : null)
  }
  const organisation = meta('hiringOrganization')

  return {
    '@type': 'JobPosting',
    title: titleText,
    description: description?.content ?? description?.html ?? null,
    datePosted: isoDate(meta('datePosted')),
    validThrough: isoDate(meta('validThrough')),
    employmentType: meta('employmentType'),
    ...(organisation ? { hiringOrganization: { name: organisation } } : {}),
    jobLocation: addresses.map((address) => ({ '@type': 'Place', address })),
  }
}

async function fetchText(url: URL): Promise<{ status: number; text: string | null }> {
  const res = await fetchPublicUrl(url, { timeoutMs: REQUEST_TIMEOUT_MS, headers: REQUEST_HEADERS })
  // 200 only: a WAF challenge is a 202 with an empty body, which res.ok accepts.
  if (!res || res.status !== 200) return { status: res?.status ?? 0, text: null }
  return { status: 200, text: await res.text() }
}

export const sitemapJsonLdAdapter: Adapter = {
  kind: 'listing',

  async fetch(source: SourceRow): Promise<RawPosting[]> {
    const sitemapUrl = new URL(source.endpoint)
    const path = postingsPath(source)
    const filter = urlFilter(source)

    const sitemap = await fetchText(sitemapUrl)
    if (sitemap.text === null) {
      throw new Error(`Sitemap request failed for ${source.slug} (HTTP ${sitemap.status || 'no response'})`)
    }

    // A sitemap index (Coles: sitemap_index.xml -> sitemap1.xml, sitemap2.xml)
    // is expanded one level. Its postings are split across the children and
    // the split moves as jobs come and go, so no single child is complete.
    // Same host only, at most MAX_CHILD_SITEMAPS, and a child that fails
    // fails the run -- half a sitemap must not read as half the jobs closing.
    let urlsets = [sitemap.text]
    if (isSitemapIndex(sitemap.text)) {
      const children: URL[] = []
      for (const loc of sitemapIndexChildren(sitemap.text)) {
        try {
          const child = new URL(loc)
          if (child.host === sitemapUrl.host) children.push(child)
        } catch {
          // an unparseable <loc> is skipped
        }
      }
      if (children.length > MAX_CHILD_SITEMAPS) {
        throw new Error(`Sitemap index for ${source.slug} lists ${children.length} sitemaps, over the ${MAX_CHILD_SITEMAPS} limit`)
      }
      urlsets = []
      for (const child of children) {
        const res = await fetchText(child)
        if (res.text === null) {
          throw new Error(`Child sitemap ${child.pathname} failed for ${source.slug} (HTTP ${res.status || 'no response'})`)
        }
        urlsets.push(res.text)
      }
    }

    const candidates: URL[] = []
    const seen = new Set<string>()
    for (const loc of urlsets.flatMap((xml) => sitemapUrls(xml))) {
      let url: URL
      try {
        url = new URL(loc)
      } catch {
        continue
      }
      // Same host only: a sitemap can't point the worker at another site.
      if (url.host !== sitemapUrl.host || !url.pathname.startsWith(path)) continue
      if (filter && !filter.test(url.pathname)) continue
      if (seen.has(url.href)) continue
      seen.add(url.href)
      candidates.push(url)
    }
    if (candidates.length > MAX_PAGES) {
      throw new Error(
        `${candidates.length} sitemap URLs match for ${source.slug}, over the ${MAX_PAGES}-page limit; narrow config.url_filter`
      )
    }

    const postings: RawPosting[] = []
    const failures: number[] = []
    for (const url of candidates) {
      const page = await fetchText(url)
      if (page.text === null) {
        failures.push(page.status)
        continue
      }
      // JSON-LD first (Myer, Coles); schema.org microdata otherwise (Deloitte).
      const job = jobPostingFromHtml(page.text) ?? jobPostingFromMicrodata(page.text)
      // A listed page with no JobPosting (a closed posting, a landing page) is skipped.
      if (!job || typeof job.title !== 'string' || !job.title.trim()) continue

      const read = new Set(['title', 'company', 'applyUrl'])
      if (Array.isArray(job.jobLocation) ? job.jobLocation.length > 0 : job.jobLocation) read.add('location')
      if (job.description) read.add('description')
      if (job.validThrough) read.add('closing_at')
      if (job.employmentType) read.add('job_type')

      const identifier = job.identifier as { value?: unknown } | undefined
      postings.push({
        sourceJobId: typeof identifier?.value === 'string' ? identifier.value : url.pathname,
        // The posting's own page, where its Apply button is.
        applyUrl: url.toString(),
        title: job.title.trim(),
        // hiringOrganization.name is the careers site's name ("MyerGroup
        // Careers"); sources.name keeps one spelling per employer.
        company: source.name,
        raw: job,
        read,
      })
    }

    if (candidates.length > 0 && failures.length === candidates.length) {
      throw new Error(
        `Every posting page failed for ${source.slug} (HTTP ${[...new Set(failures)].join(', ')}); the site may be blocking automated requests`
      )
    }
    return postings
  },
}
