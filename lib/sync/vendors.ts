/**
 * Which adapter and normaliser read a given source.
 *
 * `sources.adapter` ('ats' | 'listing' | ...) is too coarse to pick a
 * normaliser -- Workday and Greenhouse are both 'ats' but return
 * incompatible shapes -- so a source row also carries `config.vendor`.
 * Adding a vendor is one entry here plus its adapter and normaliser.
 *
 * A source whose `config.vendor` isn't listed here fails loudly with an
 * unknown-vendor error instead of half-working.
 */

import { greenhouseAdapter } from './adapters/greenhouse'
import { jobAdderAdapter, type JobAdderRawPosting } from './adapters/jobadder'
import { oracleAdapter, oracleSite } from './adapters/oracle'
import { pageupAdapter, type PageUpItem } from './adapters/pageup'
import { sitemapJsonLdAdapter, postingsPath } from './adapters/sitemap-jsonld'
import { workdayAdapter } from './adapters/workday'
import type { Adapter, RawPosting, SourceRow } from './adapters/types'
import {
  normaliseGreenhousePosting,
  normaliseJobAdderPosting,
  normaliseJsonLdPosting,
  normaliseOraclePosting,
  normalisePageUpPosting,
  normaliseWorkdayPosting,
  type GreenhouseRawPosting,
  type OracleRawPosting,
  type NormaliseResult,
  type WorkdayRawPosting,
} from './normalise'

export interface Vendor {
  adapter: Adapter
  normalise: (posting: RawPosting) => NormaliseResult
  /** The public page whose robots.txt rules stand for the employer's consent (lib/sync/robots.ts). */
  consentTarget: (source: SourceRow) => URL
}

/**
 * Workday: the endpoint is `https://<host>/wday/cxs/<tenant>/<site>`, and the
 * employer's robots.txt names the public site as `/<site>/` (Unilever:
 * `Allow: /Unilever_Early_Careers/`; Mars: `Disallow: /External/`).
 */
export function workdayConsentTarget(source: SourceRow): URL {
  const url = new URL(source.endpoint)
  const segments = url.pathname.split('/').filter(Boolean) // wday, cxs, <tenant>, <site>
  const site = segments.pop()
  if (!site) throw new Error(`Source "${source.slug}" has a Workday endpoint with no site segment`)
  // Workday's other domain (Mondelēz: wd3.myworkdaysite.com) serves the
  // public site at /recruiting/<tenant>/<site>/ instead of /<site>/.
  if (url.hostname.endsWith('.myworkdaysite.com')) {
    const tenant = segments.pop()
    if (!tenant) throw new Error(`Source "${source.slug}" has a Workday endpoint with no tenant segment`)
    return new URL(`/recruiting/${tenant}/${site}/`, url.origin)
  }
  return new URL(`/${site}/`, url.origin)
}

/** Oracle: the public careers site, `.../CandidateExperience/<lang>/sites/<site>/`. */
export function oracleConsentTarget(source: SourceRow): URL {
  return new URL(`${oracleSite(source).siteUrl}/`)
}

/** Greenhouse: the board API path the adapter reads, on boards-api.greenhouse.io. */
export function greenhouseConsentTarget(source: SourceRow): URL {
  return new URL(`${source.endpoint.replace(/\/$/, '')}/jobs`)
}

/** Sitemap + JSON-LD: the postings path on the sitemap's host (Myer: `/jobs/`, which its robots.txt disallows). */
export function sitemapJsonLdConsentTarget(source: SourceRow): URL {
  return new URL(postingsPath(source), new URL(source.endpoint).origin)
}

/** JobAdder: the widget path it reads on apps.jobadder.com, the only path that host's robots.txt allows. */
/**
 * PageUp: the employer's public listing, `/<client>/cw/` on
 * careers.pageuppeople.com (the feed is `/<client>/cw/en/rss`). Asahi's
 * robots.txt blocks admin, test and `/ci` paths only.
 */
export function pageUpConsentTarget(source: SourceRow): URL {
  const url = new URL(source.endpoint)
  const [client, site] = url.pathname.split('/').filter(Boolean)
  if (!client || !site) throw new Error(`Source "${source.slug}" needs a PageUp feed endpoint (/<client>/<site>/<lang>/rss)`)
  return new URL(`/${client}/${site}/`, url.origin)
}

export function jobAdderConsentTarget(source: SourceRow): URL {
  return new URL(`${source.endpoint.replace(/\/$/, '')}/RenderJobList`)
}

const VENDORS: Record<string, Vendor> = {
  workday: {
    adapter: workdayAdapter,
    normalise: (posting) => normaliseWorkdayPosting(posting.raw as unknown as WorkdayRawPosting, posting.company),
    consentTarget: workdayConsentTarget,
  },
  greenhouse: {
    adapter: greenhouseAdapter,
    normalise: (posting) => normaliseGreenhousePosting(posting.raw as unknown as GreenhouseRawPosting, posting.company),
    consentTarget: greenhouseConsentTarget,
  },
  oracle: {
    adapter: oracleAdapter,
    normalise: (posting) =>
      normaliseOraclePosting(posting.raw as unknown as OracleRawPosting, posting.company, posting.applyUrl),
    consentTarget: oracleConsentTarget,
  },
  jobadder: {
    adapter: jobAdderAdapter,
    normalise: (posting) =>
      normaliseJobAdderPosting(posting.raw as unknown as JobAdderRawPosting, posting.company, posting.applyUrl),
    consentTarget: jobAdderConsentTarget,
  },
  pageup: {
    adapter: pageupAdapter,
    normalise: (posting) => normalisePageUpPosting(posting.raw as unknown as PageUpItem, posting.company),
    consentTarget: pageUpConsentTarget,
  },
  sitemap_jsonld: {
    adapter: sitemapJsonLdAdapter,
    normalise: (posting) => normaliseJsonLdPosting(posting.raw, posting.company, posting.applyUrl),
    consentTarget: sitemapJsonLdConsentTarget,
  },
}

export function vendorFor(source: SourceRow): Vendor {
  const name = source.config.vendor
  const vendor = typeof name === 'string' ? VENDORS[name] : undefined
  if (!vendor) {
    throw new Error(`Source "${source.slug}" has no known vendor (config.vendor = ${JSON.stringify(name)})`)
  }
  return vendor
}
