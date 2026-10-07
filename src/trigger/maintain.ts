import { schedules, logger } from '@trigger.dev/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { expiredActiveFilter } from '@/lib/maintain/expiry'
import { classifyLinkCheck, isLinkedInJobPage, LINK_CHECK_STRIKE_LIMIT } from '@/lib/sync/link'
import { fetchPublicUrl } from '@/lib/ssrf'
import { goneFromFeed, openEndedExpired, pageSaysClosed, readTextCapped, type ExpiredReason, type SourceRun } from '@/lib/maintain/open-ended'

/**
 * Nightly maintenance: closing-date sweep, the checks for jobs with no
 * closing date (lib/maintain/open-ended.ts), then the link check.
 *
 * Kept as one task rather than folded into the sync worker (which doesn't
 * exist yet) because it applies to every job on the board, not just synced
 * ones -- the board had no expiry at all before this, so fixing it can't wait
 * on the sync schema landing. TDD's original plan ran this as a separate
 * GitHub Actions workflow from the sync pass for the same reason stated
 * there: a parser failure must not stop expired jobs coming down. Same
 * reasoning holds as a separate Trigger.dev task.
 *
 * Source-driven expiry is wired for synced jobs with no closing date only
 * (sweepOpenEndedJobs); a synced job with a closing date still waits for it.
 * Not wired here: the 30-day manual/watcher re-check flag. The digest email
 * lives with the sync (lib/sync/digest.ts).
 */

const LINK_CHECK_TIMEOUT_MS = 10_000
const LINK_CHECK_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; MMSSJobBoard/1.0)',
  Accept: 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-AU,en;q=0.9',
}

// Board holds a handful of active jobs today; this cap just stops a future
// high-volume run from selecting an unbounded page in one query. Revisit
// (paginate properly) once synced volume actually approaches it.
const LINK_CHECK_MAX_JOBS = 500

async function sweepExpiredJobs(supabase: ReturnType<typeof createAdminClient>) {
  const now = new Date()
  const { data, error } = await expiredActiveFilter(
    supabase.from('jobs').update({
      is_active: false,
      updated_at: now.toISOString(),
      ...expiredBy('closing_date_passed', now),
    }),
    now
  ).select('id')

  if (error) {
    logger.error('Expiry sweep failed', { error: error.message })
    return { swept: 0, error: error.message }
  }

  logger.info('Expiry sweep complete', { swept: data?.length ?? 0 })
  return { swept: data?.length ?? 0 }
}

/** The columns recording why and when maintenance took a job down (0058). */
function expiredBy(reason: ExpiredReason, now: Date = new Date()) {
  return { expired_reason: reason, expired_at: now.toISOString() }
}

interface OpenEndedJob {
  id: string
  source: string
  created_at: string
  expired_at: string | null
  job_fingerprints: Array<{ last_seen_at: string; source_id: string | null }> | null
}

/**
 * Jobs listed with no closing date: down once a synced one has dropped out
 * of its source's feed for two clean runs, or once any of them has been up
 * 60 days. The page-text check runs inside checkLinks, which already fetches
 * every apply URL.
 */
async function sweepOpenEndedJobs(supabase: ReturnType<typeof createAdminClient>) {
  const now = new Date()
  const { data, error } = await supabase
    .from('jobs')
    .select('id, source, created_at, expired_at, job_fingerprints(last_seen_at, source_id)')
    .eq('is_active', true)
    .is('closing_at', null)
    .limit(LINK_CHECK_MAX_JOBS)

  if (error) {
    logger.error('Open-ended sweep failed', { error: error.message })
    return { goneFromFeed: 0, aged: 0, error: error.message }
  }
  const jobs = (data ?? []) as OpenEndedJob[]

  // Recent runs for every source behind one of these jobs, in one query.
  const sourceIds = [...new Set(jobs.flatMap((j) => (j.job_fingerprints ?? []).map((f) => f.source_id)).filter(Boolean))]
  const runsBySource = new Map<string, SourceRun[]>()
  if (sourceIds.length > 0) {
    const { data: runs, error: runsError } = await supabase
      .from('sync_runs')
      .select('source_id, started_at, finished_at, error, zero_guard_tripped')
      .in('source_id', sourceIds as string[])
      .gte('started_at', new Date(now.getTime() - 30 * 86_400_000).toISOString())
    if (runsError) logger.error('Open-ended sweep: runs query failed', { error: runsError.message })
    for (const run of runs ?? []) {
      const list = runsBySource.get(run.source_id) ?? []
      list.push(run)
      runsBySource.set(run.source_id, list)
    }
  }

  const gone: string[] = []
  const aged: string[] = []
  for (const job of jobs) {
    const fp = job.job_fingerprints?.[0]
    if (job.source.startsWith('sync:') && fp?.source_id && goneFromFeed(fp.last_seen_at, runsBySource.get(fp.source_id) ?? [])) {
      gone.push(job.id)
    } else if (openEndedExpired(job, now)) {
      aged.push(job.id)
    }
  }

  for (const [ids, reason] of [[gone, 'gone_from_feed'], [aged, 'open_ended_60_days']] as const) {
    if (ids.length === 0) continue
    const { error: updateError } = await supabase
      .from('jobs')
      .update({ is_active: false, ...expiredBy(reason, now) })
      .in('id', ids)
    if (updateError) logger.error('Open-ended sweep: unpublish failed', { reason, error: updateError.message })
  }

  logger.info('Open-ended sweep complete', { checked: jobs.length, goneFromFeed: gone.length, aged: aged.length })
  return { goneFromFeed: gone.length, aged: aged.length }
}

// A filtered posting the sync hasn't seen for this long is gone from the
// employer's site -- nothing left to restore, so it leaves /admin/filters.
const FILTERED_RETENTION_DAYS = 30

async function pruneFilteredPostings(supabase: ReturnType<typeof createAdminClient>) {
  const cutoff = new Date(Date.now() - FILTERED_RETENTION_DAYS * 86_400_000).toISOString()
  const { data, error } = await supabase
    .from('filtered_postings')
    .delete()
    .eq('status', 'filtered')
    .lt('last_seen_at', cutoff)
    .select('id')

  if (error) {
    logger.error('Filtered postings prune failed', { error: error.message })
    return { pruned: 0, error: error.message }
  }
  logger.info('Filtered postings pruned', { pruned: data?.length ?? 0 })
  return { pruned: data?.length ?? 0 }
}

async function checkLinks(supabase: ReturnType<typeof createAdminClient>) {
  const { data: jobs, error } = await supabase
    .from('jobs')
    .select('id, url, link_check_strikes, closing_at')
    .eq('is_active', true)
    .limit(LINK_CHECK_MAX_JOBS)

  if (error) {
    logger.error('Link check: failed to list active jobs', { error: error.message })
    return { checked: 0, ok: 0, unpublished: [] as Array<{ id: string; reason: string }>, struck: 0, skipped: 0, errors: 1 }
  }

  const now = new Date().toISOString()
  const unpublished: Array<{ id: string; reason: string }> = []
  let ok = 0
  let struck = 0
  let skipped = 0
  let errors = 0

  // Sequential on purpose: this walks other people's servers, and the repo has
  // no volume yet to justify the complexity of a concurrency limiter. Revisit
  // once tier-A sync brings enough active jobs that a full sequential pass
  // takes long enough to matter.
  for (const job of jobs ?? []) {
    let target: URL
    try {
      target = new URL(job.url)
    } catch {
      // Historic bad data, not this check's job to fix. Leave it and move on.
      errors++
      continue
    }

    const res = await fetchPublicUrl(target, { timeoutMs: LINK_CHECK_TIMEOUT_MS, headers: LINK_CHECK_HEADERS })
    const result = res ? { status: res.status, finalUrl: res.url || target.toString() } : null
    const action = classifyLinkCheck(result)

    // A 404 or a redirect to a generic page is still believed on LinkedIn; an
    // ambiguous answer is its bot wall, not a strike (see isLinkedInJobPage).
    if (action.outcome === 'strike' && isLinkedInJobPage(target.toString())) {
      skipped++
      continue
    }

    let updates: Record<string, unknown>

    // A job with no closing date: the page itself may say the role has
    // closed while still answering 200. Only these bodies are read.
    const closedPhrase =
      action.outcome === 'ok' && !job.closing_at && res ? pageSaysClosed(await readTextCapped(res)) : null
    if (res && !res.bodyUsed) await res.body?.cancel().catch(() => {})

    if (closedPhrase) {
      updates = { is_active: false, link_check_strikes: 0, link_checked_at: now, ...expiredBy('page_says_closed') }
      unpublished.push({ id: job.id, reason: `page_says_closed: ${closedPhrase}` })
    } else if (action.outcome === 'ok') {
      ok++
      updates = { link_check_strikes: 0, link_checked_at: now }
    } else if (action.outcome === 'unpublish') {
      updates = { is_active: false, link_check_strikes: 0, link_checked_at: now, ...expiredBy('link_dead') }
      unpublished.push({ id: job.id, reason: action.reason })
    } else {
      const strikes = (job.link_check_strikes ?? 0) + 1
      if (strikes >= LINK_CHECK_STRIKE_LIMIT) {
        updates = { is_active: false, link_check_strikes: strikes, link_checked_at: now, ...expiredBy('link_dead') }
        unpublished.push({ id: job.id, reason: 'strikes_exhausted' })
      } else {
        struck++
        updates = { link_check_strikes: strikes, link_checked_at: now }
      }
    }

    const { error: updateError } = await supabase.from('jobs').update(updates).eq('id', job.id)
    if (updateError) {
      errors++
      logger.error('Link check: failed to write result', { jobId: job.id, error: updateError.message })
    }
  }

  logger.info('Link check complete', {
    checked: jobs?.length ?? 0,
    ok,
    unpublished: unpublished.length,
    struck,
    skipped,
    errors,
  })

  return { checked: jobs?.length ?? 0, ok, unpublished, struck, skipped, errors }
}

export const maintainTask = schedules.task({
  id: 'job-board-maintain',
  // 03:00 Melbourne, after the (future) sync pass -- kept as its own schedule
  // rather than chained after sync so a sync failure can't stop this running.
  cron: { pattern: '0 3 * * *', timezone: 'Australia/Melbourne' },
  maxDuration: 1800,
  run: async () => {
    const supabase = createAdminClient()
    const sweep = await sweepExpiredJobs(supabase)
    const openEnded = await sweepOpenEndedJobs(supabase)
    const linkCheck = await checkLinks(supabase)
    const filteredPruned = await pruneFilteredPostings(supabase)
    return { sweep, openEnded, linkCheck, filteredPruned }
  },
})
