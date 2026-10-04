/**
 * The Supabase-backed SnapshotLedger (lib/sync/adapters/types.ts): one
 * `brightdata_snapshots` row per snapshot a paid source bought.
 *
 * Written even on a dry run -- Bright Data bills a dry run's records the
 * same as a real one's, so leaving them out would let a few test runs
 * quietly spend the month. Runs as the service role from the worker; the
 * admin sources page reads usage through the same `monthlyUsage` sum.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { SnapshotLedger } from './adapters/types'

/** How long an uncollected snapshot is worth resuming. Bright Data keeps snapshot data for longer, but a day-old search is stale. */
const RESUME_WINDOW_MS = 24 * 60 * 60 * 1000
/** How far back already-bought posting ids are excluded from new searches. "Past week" searches can't return older ones. */
const EXCLUDE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000

export interface SnapshotRow {
  status: 'triggered' | 'collected' | 'failed'
  records: number | null
  max_records: number
}

/** First instant of the current calendar month, UTC. */
export function monthStart(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

/**
 * Records a month's snapshots count against the cap: what was delivered, or
 * the worst case for anything not delivered -- a snapshot still running may
 * yet deliver all of it, and a failed one may have been billed in part.
 */
export function monthlyUsage(rows: SnapshotRow[]): number {
  return rows.reduce((sum, row) => sum + (row.status === 'collected' ? (row.records ?? 0) : row.max_records), 0)
}

export async function recordsThisMonth(db: SupabaseClient, sourceId: string, now: Date = new Date()): Promise<number> {
  const { data, error } = await db
    .from('brightdata_snapshots')
    .select('status, records, max_records')
    .eq('source_id', sourceId)
    .gte('triggered_at', monthStart(now).toISOString())
  if (error) throw new Error(`ledger usage: ${error.message}`)
  return monthlyUsage((data ?? []) as SnapshotRow[])
}

export function snapshotLedger(db: SupabaseClient, sourceId: string): SnapshotLedger {
  return {
    recordsThisMonth: () => recordsThisMonth(db, sourceId),

    async findResumable() {
      const since = new Date(Date.now() - RESUME_WINDOW_MS).toISOString()
      const { data, error } = await db
        .from('brightdata_snapshots')
        .select('snapshot_id')
        .eq('source_id', sourceId)
        .eq('status', 'triggered')
        .gte('triggered_at', since)
        .order('triggered_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw new Error(`ledger resume: ${error.message}`)
      return data ? { snapshotId: data.snapshot_id as string } : null
    },

    async recentPostingIds(limit) {
      const since = new Date(Date.now() - EXCLUDE_WINDOW_MS).toISOString()
      const { data, error } = await db
        .from('brightdata_snapshots')
        .select('posting_ids')
        .eq('source_id', sourceId)
        .eq('status', 'collected')
        .gte('triggered_at', since)
        .order('triggered_at', { ascending: false })
      if (error) throw new Error(`ledger ids: ${error.message}`)
      const ids = new Set<string>()
      for (const row of data ?? []) {
        for (const id of (row.posting_ids as string[] | null) ?? []) {
          if (ids.size >= limit) return [...ids]
          ids.add(id)
        }
      }
      return [...ids]
    },

    async triggered({ snapshotId, inputs, maxRecords, dryRun }) {
      const { error } = await db.from('brightdata_snapshots').insert({
        source_id: sourceId,
        snapshot_id: snapshotId,
        inputs,
        max_records: maxRecords,
        dry_run: dryRun,
      })
      if (error) throw new Error(`ledger trigger: ${error.message}`)
    },

    async finished(snapshotId, outcome) {
      const update =
        outcome.status === 'collected'
          ? { status: 'collected', records: outcome.records, posting_ids: outcome.postingIds }
          : { status: 'failed', error: outcome.error }
      const { error } = await db
        .from('brightdata_snapshots')
        .update({ ...update, finished_at: new Date().toISOString() })
        .eq('snapshot_id', snapshotId)
      if (error) throw new Error(`ledger finish: ${error.message}`)
    },
  }
}
