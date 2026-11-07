import { schedules, logger, wait } from '@trigger.dev/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { expiredActiveFilter } from '@/lib/maintain/expiry'
import { isLinkedInJobPage, LINK_CHECK_STRIKE_LIMIT } from '@/lib/sync/link'
import { fetchPublicUrl } from '@/lib/ssrf'
import { goneFromFeed, openEndedExpired, readTextCapped, type ExpiredReason, type SourceRun } from '@/lib/maintain/open-ended'
import { checkPosting, POSTING_CHECK_HEADERS, readPostingResponse } from '@/lib/maintain/posting-check'
import { DATASET_ID } from '@/lib/sync/adapters/linkedin'
import { MONTHLY_RECORD_CAP } from '@/lib/sync/adapters/linkedin-config'
import {
  availabilityDue,
  closedPostings,
  linkedInPostingId,
  MAX_AVAILABILITY_CHECKS,
  type AvailabilityRecord,
} from '@/lib/sync/linkedin-availability'
import { recordsThisMonth, snapshotLedger } from '@/lib/sync/snapshot-ledger'

/**
 * Maintenance, twice a day: closing-date sweep, the checks for jobs with no
 * closing date (lib/maintain/open-ended.ts), the link check, the review
 * queue's expiry check, and every other day the LinkedIn availability check.
 *
 * Expired roles are the worst thing the board can show: a student who
 * applies for one may not come back (7 Nov 2026). So every live job's page
 * is read for a closed notice, not just those with no closing date, and the
 * queue admins review weekly is checked too, so a job that closed while
 * waiting is rejected before anyone approves it.
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
  closing_at: string | null
  created_at: string
  expired_at: string | null
  job_fingerprints: Array<{ last_seen_at: string; source_id: string | null }> | null
}

/**
 * A synced job that has dropped out of its source's feed for two clean runs
 * comes down, closing date or not -- an employer that takes a role down
 * early has closed it. LinkedIn is left out: its feed is a week's search,
 * so an older posting drops out while still open (the availability check
 * covers LinkedIn). A job with no closing date also comes down after 60
 * days. The page-text check runs inside checkLinks, which already fetches
 * every apply URL.
 */
async function sweepOpenEndedJobs(supabase: ReturnType<typeof createAdminClient>) {
  const now = new Date()
  const { data, error } = await supabase
    .from('jobs')
    .select('id, source, closing_at, created_at, expired_at, job_fingerprints(last_seen_at, source_id)')
    .eq('is_active', true)
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
    const feedSource = job.source.startsWith('sync:') && job.source !== 'sync:linkedin'
    if (feedSource && fp?.source_id && goneFromFeed(fp.last_seen_at, runsBySource.get(fp.source_id) ?? [])) {
      gone.push(job.id)
    } else if (!job.closing_at && openEndedExpired(job, now)) {
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
    .select('id, url, link_check_strikes')
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

    const res = await fetchPublicUrl(target, { timeoutMs: LINK_CHECK_TIMEOUT_MS, headers: POSTING_CHECK_HEADERS })
    // Every 2xx page is read for a closed notice, closing date or not: a role
    // that fills early says so long before its closing date.
    const html = res && res.status >= 200 && res.status < 300 ? await readTextCapped(res) : null
    if (res && !res.bodyUsed) await res.body?.cancel().catch(() => {})
    const check = readPostingResponse(res ? { status: res.status, finalUrl: res.url || target.toString(), html } : null)

    // An ambiguous answer from LinkedIn is its bot wall, not a strike (see
    // isLinkedInJobPage); the availability check reads LinkedIn instead.
    if (check.state === 'unknown' && isLinkedInJobPage(target.toString())) {
      skipped++
      continue
    }

    let updates: Record<string, unknown>

    if (check.state === 'closed') {
      const dead = check.reason === 'dead_link' || check.reason === 'link_went_generic'
      updates = { is_active: false, link_check_strikes: 0, link_checked_at: now, ...expiredBy(dead ? 'link_dead' : 'page_says_closed') }
      unpublished.push({ id: job.id, reason: dead ? check.reason : `page_says_closed: ${check.reason}` })
    } else if (check.state === 'open') {
      ok++
      updates = { link_check_strikes: 0, link_checked_at: now }
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

interface QueuedJob {
  id: string
  normalised: { url?: string | null; closing_at?: string | null } | null
  created_at: string
  sources: { slug: string } | Array<{ slug: string }> | null
  job_fingerprints: Array<{ last_seen_at: string; source_id: string | null }> | null
}

function slugOf(row: QueuedJob): string | null {
  const src = Array.isArray(row.sources) ? row.sources[0] : row.sources
  return src?.slug ?? null
}

/** Rejects review-queue rows as expired, with why, so an admin never approves a closed role. */
async function rejectExpired(supabase: ReturnType<typeof createAdminClient>, rows: Array<{ id: string; reason: string }>) {
  let rejected = 0
  for (const { id, reason } of rows) {
    const { data, error } = await supabase
      .from('staged_jobs')
      .update({ status: 'rejected', reject_reason: 'expired', reject_comment: `Expired: ${reason}`.slice(0, 500), updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'pending')
      .select('id')
    if (error) logger.error('Queue expiry: reject failed', { id, error: error.message })
    else rejected += data?.length ?? 0
  }
  return rejected
}

/**
 * The review queue: a job that closed while waiting is rejected as expired.
 * Its closing date passing, its source dropping it for two clean runs, or
 * its page saying so. LinkedIn rows are read by the availability check, as
 * LinkedIn walls these requests.
 */
async function checkReviewQueue(supabase: ReturnType<typeof createAdminClient>) {
  const { data, error } = await supabase
    .from('staged_jobs')
    .select('id, normalised, created_at, sources(slug), job_fingerprints(last_seen_at, source_id)')
    .eq('status', 'pending')
    .limit(LINK_CHECK_MAX_JOBS)
  if (error) {
    logger.error('Queue expiry: failed to list pending jobs', { error: error.message })
    return { checked: 0, rejected: 0, error: error.message }
  }
  const rows = (data ?? []) as QueuedJob[]
  const now = new Date()

  const sourceIds = [...new Set(rows.flatMap((r) => (r.job_fingerprints ?? []).map((f) => f.source_id)).filter(Boolean))]
  const runsBySource = new Map<string, SourceRun[]>()
  if (sourceIds.length > 0) {
    const { data: runs } = await supabase
      .from('sync_runs')
      .select('source_id, started_at, finished_at, error, zero_guard_tripped')
      .in('source_id', sourceIds as string[])
      .gte('started_at', new Date(now.getTime() - 30 * 86_400_000).toISOString())
    for (const run of runs ?? []) runsBySource.set(run.source_id, [...(runsBySource.get(run.source_id) ?? []), run])
  }

  const expired: Array<{ id: string; reason: string }> = []
  for (const row of rows) {
    const closing = row.normalised?.closing_at ? Date.parse(row.normalised.closing_at) : NaN
    if (!Number.isNaN(closing) && closing < now.getTime()) {
      expired.push({ id: row.id, reason: `closing date ${row.normalised!.closing_at!.slice(0, 10)} has passed` })
      continue
    }
    if (slugOf(row) === 'linkedin') continue
    const fp = row.job_fingerprints?.[0]
    if (fp?.source_id && goneFromFeed(fp.last_seen_at, runsBySource.get(fp.source_id) ?? [])) {
      expired.push({ id: row.id, reason: 'removed from the employer’s site' })
      continue
    }
    const url = row.normalised?.url
    if (!url) continue
    const check = await checkPosting(url, LINK_CHECK_TIMEOUT_MS)
    if (check.state === 'closed') expired.push({ id: row.id, reason: check.reason })
  }

  const rejected = await rejectExpired(supabase, expired)
  logger.info('Queue expiry check complete', { checked: rows.length, rejected })
  return { checked: rows.length, rejected }
}

/** Bright Data's snapshot API, for the availability check. */
const BRIGHTDATA_API = 'https://api.brightdata.com/datasets/v3'
const AVAILABILITY_POLL_SECONDS = 30
const AVAILABILITY_MAX_POLLS = 40
/** A review row is asked about once it has waited this long: newer ones were just seen open in a search. */
const QUEUE_MIN_AGE_MS = 3 * 86_400_000

async function brightData(path: string, init: RequestInit = {}) {
  const key = process.env.BRIGHTDATA_API_KEY
  if (!key) throw new Error('BRIGHTDATA_API_KEY is not set in this environment')
  return fetch(`${BRIGHTDATA_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...init.headers },
    signal: AbortSignal.timeout(60_000),
  })
}

/**
 * LinkedIn jobs, live and in review, asked of Bright Data every other day
 * (lib/sync/linkedin-availability.ts). Live jobs go first; review rows fill
 * what the month's record cap has left, oldest first. A closed live job is
 * unpublished, a closed review row rejected.
 */
async function checkLinkedInAvailability(supabase: ReturnType<typeof createAdminClient>) {
  const { data: source } = await supabase.from('sources').select('id, config').eq('slug', 'linkedin').maybeSingle()
  if (!source) return { skipped: 'no_linkedin_source' }

  const { data: last } = await supabase
    .from('brightdata_snapshots')
    .select('triggered_at')
    .eq('source_id', source.id)
    .eq('kind', 'availability')
    .order('triggered_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!availabilityDue(last?.triggered_at ?? null)) return { skipped: 'not_due' }

  const [{ data: live }, { data: queued }] = await Promise.all([
    supabase.from('jobs').select('id, url').eq('is_active', true).eq('source', 'sync:linkedin'),
    supabase
      .from('staged_jobs')
      .select('id, normalised')
      .eq('status', 'pending')
      .eq('source_id', source.id)
      .lt('created_at', new Date(Date.now() - QUEUE_MIN_AGE_MS).toISOString())
      .order('created_at', { ascending: true }),
  ])

  const configured = Number((source.config as Record<string, unknown> | null)?.monthly_cap)
  const cap = Number.isFinite(configured) && configured > 0 ? configured : MONTHLY_RECORD_CAP
  const room = Math.max(0, cap - (await recordsThisMonth(supabase, source.id)))
  const limit = Math.min(MAX_AVAILABILITY_CHECKS, room)

  // posting id -> what to close when it has closed
  const targets = new Map<string, { url: string; jobId?: string; stagedId?: string }>()
  for (const job of live ?? []) {
    const id = linkedInPostingId(job.url)
    if (id && targets.size < limit) targets.set(id, { url: job.url, jobId: job.id })
  }
  for (const row of queued ?? []) {
    const url = (row.normalised as { url?: string } | null)?.url ?? null
    const id = linkedInPostingId(url)
    if (id && url && !targets.has(id) && targets.size < limit) targets.set(id, { url, stagedId: row.id })
  }
  if (targets.size === 0) return { skipped: room === 0 ? 'monthly_cap_reached' : 'nothing_to_check' }

  const ledger = snapshotLedger(supabase, source.id)
  const inputs = [...targets.values()].map((t) => ({ url: t.url }))
  const res = await brightData(`/trigger?${new URLSearchParams({ dataset_id: DATASET_ID, include_errors: 'true' })}`, {
    method: 'POST',
    body: JSON.stringify(inputs),
  })
  const body = (await res.json().catch(() => null)) as { snapshot_id?: string } | null
  if (!res.ok || !body?.snapshot_id) {
    logger.error('Availability check: trigger failed', { status: res.status, body })
    return { error: `trigger failed (${res.status})` }
  }
  const snapshotId = body.snapshot_id
  await ledger.triggered({ snapshotId, inputs, maxRecords: inputs.length, dryRun: false, kind: 'availability' })

  let records: AvailabilityRecord[] | null = null
  for (let poll = 0; poll < AVAILABILITY_MAX_POLLS && !records; poll++) {
    await wait.for({ seconds: AVAILABILITY_POLL_SECONDS })
    const snap = await brightData(`/snapshot/${encodeURIComponent(snapshotId)}?format=json`).catch(() => null)
    if (snap?.status === 200) {
      const json: unknown = await snap.json().catch(() => null)
      if (Array.isArray(json)) records = json as AvailabilityRecord[]
    } else if (snap && snap.status >= 400 && snap.status < 500) {
      await ledger.finished(snapshotId, { status: 'failed', error: `snapshot ${snap.status}` })
      return { error: `snapshot failed (${snap.status})` }
    }
  }
  if (!records) {
    await ledger.finished(snapshotId, { status: 'failed', error: 'snapshot not ready in time' })
    return { error: 'snapshot not ready in time' }
  }
  await ledger.finished(snapshotId, { status: 'collected', records: records.length, postingIds: [] })

  const closed = closedPostings(records)
  const now = new Date()
  const jobIds: string[] = []
  const staged: Array<{ id: string; reason: string }> = []
  for (const [postingId, reason] of closed) {
    const target = targets.get(postingId)
    if (target?.jobId) jobIds.push(target.jobId)
    if (target?.stagedId) staged.push({ id: target.stagedId, reason })
  }
  if (jobIds.length > 0) {
    const { error } = await supabase
      .from('jobs')
      .update({ is_active: false, updated_at: now.toISOString(), ...expiredBy('page_says_closed', now) })
      .in('id', jobIds)
      .eq('is_active', true)
    if (error) logger.error('Availability check: unpublish failed', { error: error.message })
  }
  const rejected = await rejectExpired(supabase, staged)

  logger.info('LinkedIn availability check complete', { asked: inputs.length, returned: records.length, unpublished: jobIds.length, rejected })
  return { asked: inputs.length, returned: records.length, unpublished: jobIds.length, rejected }
}

export const maintainTask = schedules.task({
  id: 'job-board-maintain',
  // 03:00 Melbourne, after the sync pass, and again at 15:00 so a role that
  // closes in the morning is down by the evening. Its own schedule rather
  // than chained after sync, so a sync failure can't stop this running.
  cron: { pattern: '0 3,15 * * *', timezone: 'Australia/Melbourne' },
  maxDuration: 1800,
  run: async () => {
    const supabase = createAdminClient()
    const sweep = await sweepExpiredJobs(supabase)
    const openEnded = await sweepOpenEndedJobs(supabase)
    const linkCheck = await checkLinks(supabase)
    const queue = await checkReviewQueue(supabase)
    // Never let a Bright Data failure fail the run: the other checks have already done their work.
    const linkedIn = await checkLinkedInAvailability(supabase).catch((e: unknown) => {
      logger.error('LinkedIn availability check failed', { error: e instanceof Error ? e.message : String(e) })
      return { error: e instanceof Error ? e.message : String(e) }
    })
    const filteredPruned = await pruneFilteredPostings(supabase)
    return { sweep, openEnded, linkCheck, queue, linkedIn, filteredPruned }
  },
})
