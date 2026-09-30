/**
 * Oversight for jobs the sync published without review (PRD: "an admin view
 * lists everything auto-published in the last seven days with one-click
 * unpublish").
 *
 * Unpublishing is `is_active = false`, nothing more. The row stays on
 * purpose: the next run's dedup matches it by (source, external_id) or its
 * fingerprint and only bumps seen_count, and enrich never writes is_active
 * (supabase-deps.ts) -- so an unpublished posting cannot come back on its
 * own. Deleting the row would let it be re-published the following night.
 *
 * The claim is `WHERE is_active = true`, so a double click or two admins
 * racing get `conflict` rather than a second success for one change.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ActionResult } from './staged-actions'

/** The PRD's window. Past it, a job is just a job on /admin/jobs. */
export const AUTO_PUBLISHED_WINDOW_DAYS = 7

export async function unpublishJob(db: SupabaseClient, id: string): Promise<ActionResult> {
  const { data, error } = await db
    .from('jobs')
    .update({ is_active: false })
    .eq('id', id)
    .eq('is_active', true)
    // Only a synced job: this route exists for the auto-publish view, and a
    // human row has its own deactivate on /admin/jobs.
    .like('source', 'sync:%')
    .select('id')
  if (error) return { ok: false, kind: 'error', message: error.message }
  if (!data || data.length === 0) return { ok: false, kind: 'conflict' }
  return { ok: true, jobId: data[0].id }
}

export interface AutoPublishedJob {
  id: string
  title: string
  company: string
  location: string | null
  url: string
  closing_at: string | null
  is_active: boolean
  auto_published_at: string
  source: string
}

export const AUTO_PUBLISHED_COLUMNS = 'id, title, company, location, url, closing_at, is_active, auto_published_at, source'

export function autoPublishedSince(now: Date): string {
  return new Date(now.getTime() - AUTO_PUBLISHED_WINDOW_DAYS * 86_400_000).toISOString()
}

/** 'sync:unilever' -> the source's display name, falling back to the slug. */
export function sourceNameFor(jobSource: string, namesBySlug: Map<string, string>): string {
  const slug = jobSource.startsWith('sync:') ? jobSource.slice('sync:'.length) : jobSource
  return namesBySlug.get(slug) ?? slug
}
