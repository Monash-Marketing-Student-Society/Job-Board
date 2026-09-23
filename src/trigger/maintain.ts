import { schedules, logger } from '@trigger.dev/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { expiredActiveFilter } from '@/lib/maintain/expiry'
import { classifyLinkCheck, LINK_CHECK_STRIKE_LIMIT } from '@/lib/sync/link'
import { fetchPublicUrl } from '@/lib/ssrf'

/**
 * Nightly maintenance: closing-date sweep, then the link check.
 *
 * Kept as one task rather than folded into the sync worker (which doesn't
 * exist yet) because it applies to every job on the board, not just synced
 * ones -- the board had no expiry at all before this, so fixing it can't wait
 * on the sync schema landing. TDD's original plan ran this as a separate
 * GitHub Actions workflow from the sync pass for the same reason stated
 * there: a parser failure must not stop expired jobs coming down. Same
 * reasoning holds as a separate Trigger.dev task.
 *
 * Not yet wired in here, left for when the sync schema exists: source-driven
 * expiry for synced jobs with no closing date (needs job_fingerprints and
 * sources.usual_count), the 30-day manual/watcher re-check flag, and the
 * digest email (PARTNERSHIPS_EMAIL) -- the PRD ties that to sync_runs, which
 * this task has no reason to create on its own.
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
    supabase.from('jobs').update({ is_active: false, updated_at: now.toISOString() }),
    now
  ).select('id')

  if (error) {
    logger.error('Expiry sweep failed', { error: error.message })
    return { swept: 0, error: error.message }
  }

  logger.info('Expiry sweep complete', { swept: data?.length ?? 0 })
  return { swept: data?.length ?? 0 }
}

async function checkLinks(supabase: ReturnType<typeof createAdminClient>) {
  const { data: jobs, error } = await supabase
    .from('jobs')
    .select('id, url, link_check_strikes')
    .eq('is_active', true)
    .limit(LINK_CHECK_MAX_JOBS)

  if (error) {
    logger.error('Link check: failed to list active jobs', { error: error.message })
    return { checked: 0, ok: 0, unpublished: [] as Array<{ id: string; reason: string }>, struck: 0, errors: 1 }
  }

  const now = new Date().toISOString()
  const unpublished: Array<{ id: string; reason: string }> = []
  let ok = 0
  let struck = 0
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

    let updates: Record<string, unknown>

    if (action.outcome === 'ok') {
      ok++
      updates = { link_check_strikes: 0, link_checked_at: now }
    } else if (action.outcome === 'unpublish') {
      updates = { is_active: false, link_check_strikes: 0, link_checked_at: now }
      unpublished.push({ id: job.id, reason: action.reason })
    } else {
      const strikes = (job.link_check_strikes ?? 0) + 1
      if (strikes >= LINK_CHECK_STRIKE_LIMIT) {
        updates = { is_active: false, link_check_strikes: strikes, link_checked_at: now }
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
    errors,
  })

  return { checked: jobs?.length ?? 0, ok, unpublished, struck, errors }
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
    const linkCheck = await checkLinks(supabase)
    return { sweep, linkCheck }
  },
})
