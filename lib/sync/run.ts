/**
 * One source's pass through the pipeline: fetch -> normalise -> target ->
 * dedup -> risk -> stage or publish.
 *
 * Everything that touches a database goes through `SyncDeps`, so this whole
 * flow runs under vitest with fakes -- the worker (src/trigger/sync.ts) is a
 * thin caller that supplies Supabase-backed deps. Order is the TDD's, and it
 * matters: targeting runs before dedup so a rejected posting never takes
 * fingerprint space, and dedup runs before risk so a duplicate never costs a
 * review.
 *
 * Failure containment: each posting is processed inside its own try/catch, so
 * one malformed posting can't fail the source, and the caller wraps each
 * source the same way so one broken employer can't fail the run.
 *
 * Not wired here: the Gemini call for 'unsure' postings. An unsure posting
 * goes straight to review with `classifier_unsure` -- the safe fallback the
 * TDD names for an unavailable model ("held for review rather than
 * classified. Nothing is published on a guess") -- and the model call can be
 * added later without changing this shape.
 */

import { computeApplyUrlHash, computeFingerprint } from './fingerprint'
import { resolveDuplicate, sourceRank, type SourceRank } from './dedup'
import { resolveCity } from './location'
import type { NormalisedJob, NormaliseConfidence, NormaliseResult } from './normalise'
import { assessRisk, type RiskReason } from './risk'
import { targets } from './target'
import type { Adapter, RawPosting, SourceRow } from './adapters/types'

/** A job or staged job already known under one of the three identity checks. */
export interface StoredMatch {
  kind: 'job' | 'staged'
  id: string
  /** jobs.source of the stored row: 'manual', 'submission', or 'sync:<slug>'. */
  source: string
  /** The stored row's source tier, null for a human row. */
  tier: 'A' | 'B' | 'C' | null
}

export interface StagedInsert {
  sourceId: string
  externalId: string | null
  raw: Record<string, unknown>
  normalised: NormalisedJob
  fingerprint: string
  applyUrlHash: string
  confidence: NormaliseConfidence
  riskReasons: RiskReason[]
}

export interface SyncDeps {
  /**
   * The three identity checks, first hit wins: (source, external_id), then the
   * apply-URL hash, then the content fingerprint. A database concern -- the
   * first is a unique index -- so it lives behind the deps, not in here.
   */
  findExisting(keys: {
    source: string
    externalId: string | null
    applyUrlHash: string
    fingerprint: string
  }): Promise<StoredMatch | null>
  /** Jobs this source has already published (drives the new-adapter hold). */
  countPublished(sourceSlug: string): Promise<number>
  /** Insert into staged_jobs (and record its fingerprint). */
  stage(row: StagedInsert): Promise<void>
  /** Insert straight into jobs with auto_published_at set (and record its fingerprint). */
  publish(row: StagedInsert): Promise<void>
  /** Better apply URL + description onto an existing SYNCED row. Must refuse a human row itself. */
  enrich(match: StoredMatch, job: NormalisedJob): Promise<void>
  /** Bump seen_count / last_seen_at for a duplicate that was discarded. */
  touch(match: StoredMatch): Promise<void>
}

export interface RunCounts {
  seen: number
  /** Published unattended. */
  created: number
  deduped: number
  rejected: number
  /** Held in staged_jobs for review. */
  held: number
  errors: number
}

export function emptyCounts(): RunCounts {
  return { seen: 0, created: 0, deduped: 0, rejected: 0, held: 0, errors: 0 }
}

/** A source publishes unattended only once it has been explicitly flipped. */
function isReviewOnly(source: SourceRow): boolean {
  return source.config.auto_publish !== true
}

export async function processPosting(
  posting: RawPosting,
  result: NormaliseResult,
  source: SourceRow,
  deps: SyncDeps,
  counts: RunCounts
): Promise<void> {
  const { job, confidence } = result

  const verdict = targets({
    title: job.title,
    jobType: job.job_type,
    location: job.location,
    tags: job.tags,
  })
  if (verdict === 'reject') {
    counts.rejected++
    return
  }

  const city = resolveCity(job.location)
  const fingerprint = computeFingerprint(job.company, job.title, city)
  const applyUrlHash = computeApplyUrlHash(job.url)
  const sourceKey = `sync:${source.slug}`

  const existing = await deps.findExisting({
    source: sourceKey,
    externalId: posting.sourceJobId,
    applyUrlHash,
    fingerprint,
  })

  if (existing) {
    const incoming: SourceRank = sourceRank(sourceKey, source.tier)
    const stored: SourceRank = sourceRank(existing.source, existing.tier)
    if (resolveDuplicate(incoming, stored) === 'enrich') {
      await deps.enrich(existing, job)
    } else {
      await deps.touch(existing)
    }
    counts.deduped++
    return
  }

  const riskReasons = assessRisk({
    job,
    confidence,
    tier: source.tier,
    verdict,
    publishedFromSource: await deps.countPublished(source.slug),
    reviewOnly: isReviewOnly(source),
  })

  const row: StagedInsert = {
    sourceId: source.id,
    externalId: posting.sourceJobId,
    raw: posting.raw,
    normalised: job,
    fingerprint,
    applyUrlHash,
    confidence,
    riskReasons,
  }

  if (riskReasons.length === 0) {
    await deps.publish(row)
    counts.created++
  } else {
    await deps.stage(row)
    counts.held++
  }
}

/**
 * Runs one source. `normalise` is supplied per vendor (see lib/sync/vendors.ts)
 * because each ATS structures the same facts differently. A transport failure
 * from the adapter throws out of here so the caller records it as the run's
 * error; a single bad posting only bumps `errors`.
 */
export async function processSource(
  source: SourceRow,
  adapter: Adapter,
  normalise: (posting: RawPosting) => NormaliseResult,
  deps: SyncDeps
): Promise<RunCounts> {
  const counts = emptyCounts()
  const postings = await adapter.fetch(source)

  for (const posting of postings) {
    counts.seen++
    try {
      await processPosting(posting, normalise(posting), source, deps, counts)
    } catch {
      counts.errors++
    }
  }

  return counts
}

/**
 * A run "counts" for source-driven expiry only if it looks like the source
 * actually answered: zero results, or more than 50% under the usual count, is
 * far more likely a broken parser than a genuinely empty employer, and must
 * not be allowed to unpublish that employer's jobs.
 */
export function zeroGuardTripped(seen: number, usualCount: number | null): boolean {
  if (seen === 0) return true
  if (usualCount === null || usualCount <= 0) return false
  return seen < usualCount * 0.5
}

/** Rolling median of a source's last few successful runs -- drifts down through a quiet spell. */
export function rollingMedian(counts: number[]): number | null {
  if (counts.length === 0) return null
  const sorted = [...counts].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}
