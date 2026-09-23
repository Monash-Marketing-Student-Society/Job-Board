/**
 * What happens when an incoming posting matches a fingerprint (or apply-URL
 * hash, or source identity) that already exists.
 *
 * The pipeline never creates a second record for a known fingerprint -- it
 * decides by source rank instead: human beats the employer's own site, which
 * beats an aggregator, which beats LinkedIn. Rank is about who's vouching for
 * the posting, not how the pipeline read it -- an employer's own Workday feed
 * and their Greenhouse board are both `employer_site`, ranked purely by tier
 * (sources.tier), never by adapter kind.
 */

export type SourceRank = 'human' | 'employer_site' | 'aggregator' | 'linkedin'

// Lower number = more trusted. A submitted or manually-created job is never
// second-guessed by anything synced, however reputable the source.
const RANK_ORDER: Record<SourceRank, number> = {
  human: 0,
  employer_site: 1,
  aggregator: 2,
  linkedin: 3,
}

/**
 * `jobs.source` of 'manual' or 'submission' is always human -- the existing
 * values this column has carried since 0001_init.sql, never a synced row's
 * shape ('sync:<slug>'). A synced row's rank comes from its source's tier:
 * A -> employer_site, B -> aggregator, C -> linkedin. `tier` is `null` only
 * for a human job (which never reaches this branch) or bad data -- treated
 * as the least-trusted synced rank rather than throwing, since a rank
 * decision must never crash the run over one row's missing tier.
 */
export function sourceRank(source: string, tier: 'A' | 'B' | 'C' | null): SourceRank {
  if (source === 'manual' || source === 'submission') return 'human'
  if (tier === 'A') return 'employer_site'
  if (tier === 'B') return 'aggregator'
  if (tier === 'C') return 'linkedin'
  return 'linkedin'
}

export type DuplicateAction = 'enrich' | 'discard'

/**
 * Given the rank of an incoming posting and the rank of the stored job (or
 * staged job) its fingerprint already matches.
 *
 * `stored === 'human'` short-circuits ahead of the rank comparison rather
 * than falling out of it naturally, and deliberately so -- it's the rule the
 * TDD calls out as the one with money attached ("A sponsor's own wording,
 * logo and apply link survive intact"), worth being unmissable in the code
 * rather than an emergent property of the ordering table. The worker
 * enforces this a second time as a `WHERE source LIKE 'sync:%'` predicate on
 * every enrichment UPDATE, so a bug here still can't rewrite a human job --
 * this function is the first guard, not the only one.
 *
 * Equal rank discards, not enriches: two employer-site postings of the same
 * fingerprint are a re-run or pagination overlap (already true 99% of the
 * time thanks to the source-identity check running first), not grounds to
 * treat the second sighting as an upgrade.
 */
export function resolveDuplicate(incoming: SourceRank, stored: SourceRank): DuplicateAction {
  if (stored === 'human') return 'discard'
  return RANK_ORDER[incoming] < RANK_ORDER[stored] ? 'enrich' : 'discard'
}
