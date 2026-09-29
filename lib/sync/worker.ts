/**
 * What the Trigger.dev task actually calls: load the enabled sources and run
 * each one in isolation. Kept out of src/trigger/ so it lives inside the
 * vitest suite (which only collects lib/**\/*.test.ts).
 *
 * Failure containment is the design: every source runs inside its own
 * try/catch, so one broken employer -- an unknown vendor, a Workday tenant
 * that 500s -- records an error on its own sync_runs row and the next source
 * still runs.
 *
 * Not built yet, and deliberately: auto-demoting a source to tier B after
 * two runs above 30% rejects (TDD "Observability and failure modes"), and
 * source-driven expiry off `last_seen_at`. Both need a few real runs of
 * history to be worth tuning, so they land with phase 2's source management.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { SourceRow } from './adapters/types'
import { emptyCounts, processSource, zeroGuardTripped } from './run'
import { dryRunDeps, recordSourceRun, supabaseDeps, type SourceRunResult } from './supabase-deps'
import { vendorFor } from './vendors'

export type LoadedSource = SourceRow & { usual_count: number | null; frequency: string }

export interface WorkerOptions {
  /** Read for real, write nothing -- no rows, no sync_runs. How a new adapter is proven. */
  dryRun: boolean
  /** Run just this source, whatever its frequency. */
  slug?: string
}

export async function loadSources(db: SupabaseClient, slug?: string): Promise<LoadedSource[]> {
  let query = db
    .from('sources')
    .select('id, slug, name, tier, adapter, endpoint, config, usual_count, frequency')
    .eq('enabled', true)
    .neq('adapter', 'watcher') // the watcher adapter creates review items, not jobs -- phase 4
  query = slug ? query.eq('slug', slug) : query.eq('frequency', 'nightly')

  const { data, error } = await query
  if (error) throw new Error(`loadSources: ${error.message}`)
  return (data ?? []) as LoadedSource[]
}

export async function runOneSource(db: SupabaseClient, source: LoadedSource, opts: WorkerOptions): Promise<SourceRunResult> {
  const startedAt = new Date()
  let result: SourceRunResult

  try {
    const vendor = vendorFor(source)
    const real = supabaseDeps(db, source)
    const counts = await processSource(source, vendor.adapter, vendor.normalise, opts.dryRun ? dryRunDeps(real) : real)
    result = { counts, error: null, zeroGuardTripped: zeroGuardTripped(counts.seen, source.usual_count) }
  } catch (e) {
    result = { counts: emptyCounts(), error: e instanceof Error ? e.message : String(e), zeroGuardTripped: false }
  }

  if (!opts.dryRun) await recordSourceRun(db, source, startedAt, result)
  return result
}

export interface WorkerSummary {
  slug: string
  counts: SourceRunResult['counts']
  error: string | null
  zeroGuardTripped: boolean
}

export async function runAllSources(db: SupabaseClient, opts: WorkerOptions): Promise<WorkerSummary[]> {
  const sources = await loadSources(db, opts.slug)
  const summaries: WorkerSummary[] = []
  for (const source of sources) {
    const r = await runOneSource(db, source, opts)
    summaries.push({ slug: source.slug, counts: r.counts, error: r.error, zeroGuardTripped: r.zeroGuardTripped })
  }
  return summaries
}
