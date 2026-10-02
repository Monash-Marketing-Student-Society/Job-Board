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
import { oracleAdapter, oracleSite } from './adapters/oracle'
import { workdayAdapter } from './adapters/workday'
import type { Adapter, RawPosting, SourceRow } from './adapters/types'
import {
  normaliseGreenhousePosting,
  normaliseOraclePosting,
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
  const site = url.pathname.split('/').filter(Boolean).pop()
  if (!site) throw new Error(`Source "${source.slug}" has a Workday endpoint with no site segment`)
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
}

export function vendorFor(source: SourceRow): Vendor {
  const name = source.config.vendor
  const vendor = typeof name === 'string' ? VENDORS[name] : undefined
  if (!vendor) {
    throw new Error(`Source "${source.slug}" has no known vendor (config.vendor = ${JSON.stringify(name)})`)
  }
  return vendor
}
