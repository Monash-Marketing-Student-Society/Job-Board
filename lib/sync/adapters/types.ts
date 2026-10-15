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
  /** The employer's logo image as the source shows it, if any (LinkedIn's company_logo). Copied when the company has none. */
  logoUrl?: string | null
}

/**
 * A paid source's spend record (today only LinkedIn via Bright Data): one
 * entry per snapshot bought, so the monthly budget is counted from what was
 * actually requested -- dry runs included, because Bright Data bills them
 * the same -- rather than from what the pipeline kept.
 */
export interface SnapshotLedger {
  /** Records used this calendar month (UTC): delivered counts, plus the worst case of any snapshot not yet collected. */
  recordsThisMonth(): Promise<number>
  /** A snapshot triggered recently but never collected (the run died waiting), to collect instead of paying twice. */
  findResumable(): Promise<{ snapshotId: string } | null>
  /** Posting ids already bought recently -- kept and rejected alike -- so the next search skips them. */
  recentPostingIds(limit: number): Promise<string[]>
  /** `kind` defaults to 'jobs'; company lookups share the budget but are never resumed as a job search. */
  triggered(entry: { snapshotId: string; inputs: unknown[]; maxRecords: number; dryRun: boolean; kind?: 'jobs' | 'companies' }): Promise<void>
  finished(
    snapshotId: string,
    outcome: { status: 'collected'; records: number; postingIds: string[] } | { status: 'failed'; error: string }
  ): Promise<void>
}

/** A LinkedIn employer, as a job record names it. */
export interface CompanyRef {
  companyId: string
  /** Canonical company page, e.g. https://www.linkedin.com/company/hatch-team */
  url: string
}

/** One looked-up employer, as cached in linkedin_companies. */
export interface CompanySize extends CompanyRef {
  name: string | null
  companySize: string | null
  /** Lower bound of LinkedIn's size band; null when the lookup returned no size. */
  employeesMin: number | null
  employeesOnLinkedIn: number | null
}

/** The employer-size cache behind the Sydney size rule (lib/sync/linkedin-companies.ts). */
export interface CompanyStore {
  /** Cached sizes by company id. An id missing from the map was never looked up; null = looked up, no size. */
  sizes(companyIds: string[]): Promise<Map<string, number | null>>
  save(rows: CompanySize[]): Promise<void>
  /** Sydney LinkedIn employers waiting in the review queue that were never looked up. */
  pendingUnknown(limit: number): Promise<CompanyRef[]>
}

/** What an adapter may need beyond its source row. Free adapters ignore it. */
export interface AdapterContext {
  ledger: SnapshotLedger
  /** LinkedIn only: where employer sizes are cached. Absent in tests that don't need it. */
  companies?: CompanyStore
  /** Waits between polls. Trigger.dev passes `wait.for`, which checkpoints instead of billing compute. */
  sleep(ms: number): Promise<void>
  dryRun: boolean
}

export interface Adapter {
  kind: SourceRow['adapter']
  /** Raw postings, before normalisation. Throws on transport failure so the run records the error. */
  fetch(source: SourceRow, ctx?: AdapterContext): Promise<RawPosting[]>
}
