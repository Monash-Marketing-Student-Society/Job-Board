import { createServerClient } from '@/lib/supabase/server'
import { SourcesTable, type SourceView } from '@/components/admin/sources-table'
import { tableCardClassName } from '@/components/admin/table/table-styles'
import {
  ADMIN_SOURCE_COLUMNS,
  countPublishedBySlug,
  publishMode,
  runHealth,
  tallyReviews,
  type AdminSource,
  type RunRow,
} from '@/lib/sync/source-admin'

export const metadata = {
  title: 'Sources | Admin | MMSS Job Board',
}

/** Recent runs per source: enough to see a pattern, not a history view. */
const RUNS_PER_SOURCE = 5

/** Window for the approve/reject tally -- covers a five-day soak with room either side. */
const REVIEW_WINDOW_DAYS = 14

type Db = Awaited<ReturnType<typeof createServerClient>>

async function recentRuns(supabase: Db, sourceId: string): Promise<RunRow[]> {
  const { data } = await supabase
    .from('sync_runs')
    .select('started_at, finished_at, seen, created, deduped, rejected, held, error, zero_guard_tripped')
    .eq('source_id', sourceId)
    .order('started_at', { ascending: false })
    .limit(RUNS_PER_SOURCE)
  return (data ?? []) as RunRow[]
}

/**
 * Everything is read through the admin's own session: sources, sync_runs and
 * staged_jobs all carry an admin SELECT policy (0029, 0030, 0032). Writes go
 * through PATCH /api/admin/sources/[id].
 */
export default async function AdminSourcesPage() {
  const supabase = await createServerClient()
  const now = new Date()
  const since = new Date(now.getTime() - REVIEW_WINDOW_DAYS * 86_400_000).toISOString()

  const [sourcesResult, reviewsResult, publishedResult] = await Promise.all([
    supabase.from('sources').select(ADMIN_SOURCE_COLUMNS).order('name'),
    // Pending of any age, plus whatever was decided inside the window.
    supabase.from('staged_jobs').select('source_id, status').or(`status.eq.pending,updated_at.gte.${since}`),
    // The same count risk.ts's new-adapter hold uses: every job a source has put on the board.
    supabase.from('jobs').select('source').like('source', 'sync:%'),
  ])

  if (sourcesResult.error) {
    throw new Error(`Could not load sources: ${sourcesResult.error.message}`)
  }

  const sources = (sourcesResult.data ?? []) as AdminSource[]
  const runs = await Promise.all(sources.map((s) => recentRuns(supabase, s.id)))
  const reviews = tallyReviews(reviewsResult.data ?? [])
  const published = countPublishedBySlug(publishedResult.data ?? [])

  const rows: SourceView[] = sources.map((source, i) => {
    const publishedCount = published.get(source.slug) ?? 0
    return {
      id: source.id,
      slug: source.slug,
      name: source.name,
      tier: source.tier,
      endpoint: source.endpoint,
      vendor: typeof source.config.vendor === 'string' ? source.config.vendor : null,
      enabled: source.enabled,
      autoPublish: source.config.auto_publish === true,
      usualCount: source.usual_count,
      runs: runs[i],
      health: runHealth(runs[i][0] ?? null, source, now),
      mode: publishMode(source, publishedCount),
      reviews: reviews.get(source.id) ?? { pending: 0, approved: 0, rejected: 0 },
    }
  })

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-[22px] font-bold text-slate-800 font-heading">Sources</h1>
        <p className="text-sm text-slate-500 mt-1">
          Employer feeds the nightly sync reads. Changes apply from the next run, at 2am Melbourne time.
        </p>
      </div>

      <div className={tableCardClassName}>
        <SourcesTable rows={rows} reviewWindowDays={REVIEW_WINDOW_DAYS} />
      </div>
    </div>
  )
}
