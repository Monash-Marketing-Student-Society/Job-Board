import { createServerClient } from '@/lib/supabase/server'
import { tableCardClassName } from '@/components/admin/table/table-styles'
import {
  FilterReview,
  type FeedbackRow,
  type FilteredRow,
  type ReasonCount,
} from '@/components/admin/filter-review'

export const metadata = {
  title: 'Filters | Admin | MMSS Job Board',
}

/** Most recent first; past this the oldest drop off until they are pruned or restored. */
const FILTERED_LIMIT = 300
const FEEDBACK_LIMIT = 200
/** The reason tally covers the trial so far with room either side. */
const REASON_WINDOW_DAYS = 30

type Db = Awaited<ReturnType<typeof createServerClient>>

function sourceName(sources: unknown): string | null {
  const src = Array.isArray(sources) ? sources[0] : sources
  return (src as { name?: string } | null)?.name ?? null
}

/**
 * Only the fields the list shows -- `normalised` carries the whole
 * description, which would make a few hundred rows several MB.
 */
async function getFiltered(supabase: Db): Promise<FilteredRow[]> {
  const { data, error } = await supabase
    .from('filtered_postings')
    .select(
      'id, rule, evidence, seen_count, first_seen_at, last_seen_at, title:normalised->>title, company:normalised->>company, location:normalised->>location, url:normalised->>url, sources(name)'
    )
    .eq('status', 'filtered')
    .order('last_seen_at', { ascending: false })
    .limit(FILTERED_LIMIT)

  if (error || !data) return []
  return data.map((row) => ({
    id: row.id,
    rule: row.rule,
    evidence: row.evidence,
    seenCount: row.seen_count,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    title: (row.title as string | null) ?? '(untitled)',
    company: (row.company as string | null) ?? '',
    location: row.location as string | null,
    url: (row.url as string | null) ?? '',
    source: sourceName(row.sources),
  }))
}

/**
 * Rejects an admin explained in their own words. The recheck's own comments
 * ("Filter recheck: …") are left out -- they restate a rule, not a judgement.
 */
async function getFeedback(supabase: Db): Promise<FeedbackRow[]> {
  const { data, error } = await supabase
    .from('staged_jobs')
    .select('id, reject_reason, reject_comment, updated_at, title:normalised->>title, company:normalised->>company, url:normalised->>url, sources(name)')
    .eq('status', 'rejected')
    .not('reject_comment', 'is', null)
    .not('reject_comment', 'like', 'Filter recheck:%')
    .order('updated_at', { ascending: false })
    .limit(FEEDBACK_LIMIT)

  if (error || !data) return []
  return data.map((row) => ({
    id: row.id,
    reason: row.reject_reason ?? 'other',
    comment: row.reject_comment ?? '',
    rejectedAt: row.updated_at,
    title: (row.title as string | null) ?? '(untitled)',
    company: (row.company as string | null) ?? '',
    url: (row.url as string | null) ?? '',
    source: sourceName(row.sources),
  }))
}

async function getReasonCounts(supabase: Db): Promise<ReasonCount[]> {
  const since = new Date(Date.now() - REASON_WINDOW_DAYS * 86_400_000).toISOString()
  const { data, error } = await supabase
    .from('staged_jobs')
    .select('reject_reason')
    .eq('status', 'rejected')
    .gte('updated_at', since)

  if (error || !data) return []
  const counts = new Map<string, number>()
  for (const row of data) {
    const reason = row.reject_reason ?? 'other'
    counts.set(reason, (counts.get(reason) ?? 0) + 1)
  }
  return [...counts.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count)
}

export default async function FiltersPage() {
  const supabase = await createServerClient()
  const [filtered, feedback, reasonCounts] = await Promise.all([
    getFiltered(supabase),
    getFeedback(supabase),
    getReasonCounts(supabase),
  ])

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-[22px] font-bold text-slate-800 font-heading">Filters</h1>
        <p className="text-sm text-slate-500 mt-1">
          What the sync filter removed before review, and why admins rejected what got through. Restore anything the
          filter got wrong.
        </p>
      </div>

      <div className={tableCardClassName}>
        <FilterReview
          filtered={filtered}
          feedback={feedback}
          reasonCounts={reasonCounts}
          reasonWindowDays={REASON_WINDOW_DAYS}
        />
      </div>
    </div>
  )
}
