/**
 * The Supabase-backed SyncDeps, plus the per-run bookkeeping (sync_runs,
 * sources.last_run_at / usual_count).
 *
 * Runs as the service role from the Trigger.dev worker -- never imported by
 * anything a browser bundle can reach.
 *
 * Supabase's JS client has no multi-statement transactions, so `stage` and
 * `publish` are two inserts (the row, then its fingerprint). If the second
 * fails the row still exists and the next run finds it through the
 * (source, external_id) unique index -- the first and cheapest identity
 * check -- so a half-written pair self-heals instead of duplicating. That is
 * why identity check #1 comes first in `findExisting`.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { SourceRow } from './adapters/types'
import { rollingMedian, zeroGuardTripped, type RunCounts, type StagedInsert, type StoredMatch, type SyncDeps } from './run'
import type { NormalisedJob } from './normalise'

type Tier = 'A' | 'B' | 'C'

/** Tier of a `sync:<slug>` source, cached for the run -- a human source has none. */
async function tierFor(db: SupabaseClient, cache: Map<string, Tier | null>, source: string): Promise<Tier | null> {
  if (!source.startsWith('sync:')) return null
  if (cache.has(source)) return cache.get(source) ?? null
  const { data } = await db.from('sources').select('tier').eq('slug', source.slice('sync:'.length)).maybeSingle()
  const tier = (data?.tier as Tier | undefined) ?? null
  cache.set(source, tier)
  return tier
}

/** Resolve a job_fingerprints row to whatever it points at: a live job, or a staged one. */
async function matchFromFingerprint(
  db: SupabaseClient,
  tiers: Map<string, Tier | null>,
  row: { job_id: string | null; staged_job_id: string | null }
): Promise<StoredMatch | null> {
  if (row.job_id) {
    const { data } = await db.from('jobs').select('id, source').eq('id', row.job_id).maybeSingle()
    if (!data) return null
    return { kind: 'job', id: data.id, source: data.source, tier: await tierFor(db, tiers, data.source) }
  }
  if (row.staged_job_id) {
    const { data } = await db
      .from('staged_jobs')
      .select('id, sources(slug, tier)')
      .eq('id', row.staged_job_id)
      .maybeSingle()
    if (!data) return null
    const src = (Array.isArray(data.sources) ? data.sources[0] : data.sources) as { slug: string; tier: Tier } | null
    return { kind: 'staged', id: data.id, source: `sync:${src?.slug ?? 'unknown'}`, tier: src?.tier ?? null }
  }
  return null
}

function jobInsert(source: string, row: StagedInsert) {
  const j = row.normalised
  return {
    source,
    external_id: row.externalId,
    title: j.title,
    company: j.company,
    location: j.location,
    work_mode: j.work_mode,
    job_type: j.job_type,
    url: j.url,
    description: j.description,
    tags: j.tags,
    posted_at: j.posted_at,
    closing_at: j.closing_at,
    is_active: true,
  }
}

export function supabaseDeps(db: SupabaseClient, source: SourceRow): SyncDeps {
  const tiers = new Map<string, Tier | null>()
  const sourceKey = `sync:${source.slug}`

  return {
    async findExisting({ source: src, externalId, applyUrlHash, fingerprint }) {
      // 1. Source identity -- the unique partial index from 0001_init.sql.
      if (externalId) {
        const { data } = await db
          .from('jobs')
          .select('id, source')
          .eq('source', src)
          .eq('external_id', externalId)
          .maybeSingle()
        if (data) return { kind: 'job', id: data.id, source: data.source, tier: await tierFor(db, tiers, data.source) }
      }
      // 2. Apply URL, 3. content fingerprint.
      for (const [column, value] of [
        ['apply_url_hash', applyUrlHash],
        ['fingerprint', fingerprint],
      ] as const) {
        const { data } = await db
          .from('job_fingerprints')
          .select('job_id, staged_job_id')
          .eq(column, value)
          .limit(1)
          .maybeSingle()
        if (data) {
          const match = await matchFromFingerprint(db, tiers, data)
          if (match) return match
        }
      }
      return null
    },

    async countPublished(slug) {
      const { count } = await db.from('jobs').select('id', { count: 'exact', head: true }).eq('source', `sync:${slug}`)
      return count ?? 0
    },

    async stage(row) {
      const { data, error } = await db
        .from('staged_jobs')
        .insert({
          source_id: row.sourceId,
          external_id: row.externalId,
          raw: row.raw,
          normalised: row.normalised,
          fingerprint: row.fingerprint,
          confidence: row.confidence,
          risk_reasons: row.riskReasons,
        })
        .select('id')
        .single()
      if (error) throw new Error(`stage: ${error.message}`)

      const { error: fpError } = await db.from('job_fingerprints').insert({
        fingerprint: row.fingerprint,
        source_id: row.sourceId,
        staged_job_id: data.id,
        apply_url_hash: row.applyUrlHash,
        source_job_id: row.externalId,
      })
      if (fpError) throw new Error(`stage fingerprint: ${fpError.message}`)
    },

    async publish(row) {
      const { data, error } = await db
        .from('jobs')
        .insert({ ...jobInsert(sourceKey, row), auto_published_at: new Date().toISOString() })
        .select('id')
        .single()
      if (error) throw new Error(`publish: ${error.message}`)

      const { error: fpError } = await db.from('job_fingerprints').insert({
        fingerprint: row.fingerprint,
        source_id: row.sourceId,
        job_id: data.id,
        apply_url_hash: row.applyUrlHash,
        source_job_id: row.externalId,
      })
      if (fpError) throw new Error(`publish fingerprint: ${fpError.message}`)
    },

    async enrich(match: StoredMatch, job: NormalisedJob) {
      const better = { url: job.url, description: job.description }
      if (match.kind === 'job') {
        // The second of the TDD's two guards on rule 3: even if the ranking
        // logic upstream were wrong, this predicate cannot touch a human row.
        // created_at and is_sponsored are deliberately not in the update.
        const { error } = await db.from('jobs').update(better).eq('id', match.id).like('source', 'sync:%')
        if (error) throw new Error(`enrich job: ${error.message}`)
      } else {
        const { data } = await db.from('staged_jobs').select('normalised').eq('id', match.id).eq('status', 'pending').maybeSingle()
        if (!data) return
        const { error } = await db
          .from('staged_jobs')
          .update({ normalised: { ...(data.normalised as object), ...better } })
          .eq('id', match.id)
          .eq('status', 'pending')
        if (error) throw new Error(`enrich staged: ${error.message}`)
      }
    },

    async touch(match) {
      const column = match.kind === 'job' ? 'job_id' : 'staged_job_id'
      const { data } = await db.from('job_fingerprints').select('fingerprint, seen_count').eq(column, match.id).maybeSingle()
      if (!data) return
      // Read-modify-write is fine: the workflow's concurrency group means
      // there is only ever one writer.
      await db
        .from('job_fingerprints')
        .update({ seen_count: (data.seen_count ?? 0) + 1, last_seen_at: new Date().toISOString() })
        .eq('fingerprint', data.fingerprint)
    },
  }
}

/** A dry run reads for real but writes nothing: same dedup answers, no rows, no mail. */
export function dryRunDeps(real: SyncDeps): SyncDeps {
  const noop = async () => {}
  return { ...real, stage: noop, publish: noop, enrich: noop, touch: noop }
}

export interface SourceRunResult {
  counts: RunCounts
  error: string | null
  zeroGuardTripped: boolean
}

/**
 * Records one source's run: a sync_runs row, then last_run_at and (for a run
 * that answered normally) a fresh usual_count. A run that trips the zero
 * guard is recorded but neither moves usual_count nor is trusted for expiry.
 */
export async function recordSourceRun(
  db: SupabaseClient,
  source: SourceRow & { usual_count?: number | null },
  startedAt: Date,
  result: SourceRunResult
): Promise<void> {
  const { counts } = result
  await db.from('sync_runs').insert({
    source_id: source.id,
    started_at: startedAt.toISOString(),
    finished_at: new Date().toISOString(),
    seen: counts.seen,
    created: counts.created,
    deduped: counts.deduped,
    rejected: counts.rejected,
    held: counts.held,
    error: result.error,
    zero_guard_tripped: result.zeroGuardTripped,
  })

  const update: Record<string, unknown> = { last_run_at: new Date().toISOString() }
  if (!result.error && !result.zeroGuardTripped) {
    const { data } = await db
      .from('sync_runs')
      .select('seen')
      .eq('source_id', source.id)
      .is('error', null)
      .eq('zero_guard_tripped', false)
      .order('started_at', { ascending: false })
      .limit(5)
    const median = rollingMedian((data ?? []).map((r: { seen: number }) => r.seen))
    if (median !== null) update.usual_count = median
  }
  await db.from('sources').update(update).eq('id', source.id)
}

export { zeroGuardTripped }
