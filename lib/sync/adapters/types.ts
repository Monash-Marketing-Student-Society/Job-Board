/**
 * The one interface every source adapter satisfies (TDD's "Source adapters"
 * section). Adding an employer is a `sources` row plus, at most, a selector --
 * not a new service -- because every adapter kind emits the same shape here,
 * and everything downstream (normalise, target, fingerprint) reads only this.
 */

export interface SourceRow {
  id: string
  slug: string
  name: string
  tier: 'A' | 'B' | 'C'
  adapter: 'ats' | 'listing' | 'aggregator' | 'watcher'
  endpoint: string
  config: Record<string, unknown>
}

export interface RawPosting {
  sourceJobId: string | null
  applyUrl: string
  title: string
  company: string
  raw: Record<string, unknown>
  /** Which fields were read from structured data on THIS posting, not guessed. */
  read: Set<string>
}

export interface Adapter {
  kind: SourceRow['adapter']
  /** Raw postings, before normalisation. Throws on transport failure so the run records the error. */
  fetch(source: SourceRow): Promise<RawPosting[]>
}
