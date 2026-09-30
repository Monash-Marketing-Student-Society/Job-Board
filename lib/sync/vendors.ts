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
import { workdayAdapter } from './adapters/workday'
import type { Adapter, RawPosting, SourceRow } from './adapters/types'
import {
  normaliseGreenhousePosting,
  normaliseWorkdayPosting,
  type GreenhouseRawPosting,
  type NormaliseResult,
  type WorkdayRawPosting,
} from './normalise'

export interface Vendor {
  adapter: Adapter
  normalise: (posting: RawPosting) => NormaliseResult
}

const VENDORS: Record<string, Vendor> = {
  workday: {
    adapter: workdayAdapter,
    normalise: (posting) => normaliseWorkdayPosting(posting.raw as unknown as WorkdayRawPosting, posting.company),
  },
  greenhouse: {
    adapter: greenhouseAdapter,
    normalise: (posting) => normaliseGreenhousePosting(posting.raw as unknown as GreenhouseRawPosting, posting.company),
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
