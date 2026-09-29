import { schedules, task, logger } from '@trigger.dev/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { runAllSources, type WorkerSummary } from '@/lib/sync/worker'
import { sendRunDigest } from '@/lib/sync/digest'
import { sendEmail } from '@/lib/email'

/**
 * The sync worker: every enabled nightly source through the pipeline in
 * lib/sync/run.ts. Two entry points:
 *
 * - `job-board-sync` runs nightly at 02:00 Melbourne, an hour ahead of the
 *   maintenance task (03:00) so the link check sees tonight's jobs.
 * - `job-board-sync-manual` is triggered by hand from the Trigger.dev
 *   dashboard, and defaults to a DRY RUN -- it reads the real feed and
 *   decides everything, but writes no rows. That's how a new source is
 *   proven before it's enabled: run it, read the counts, then turn it on.
 *
 * Phase 1 publishes nothing unattended: every source is review-only until an
 * admin sets `config.auto_publish = true` on its row, which the phase-2 soak
 * decides. Held postings land in staged_jobs for /admin/submissions.
 *
 * After a real run (never a dry one) a digest goes to partnerships@ if
 * anything was held or any source broke -- see lib/sync/digest.ts. It needs
 * SYNC_DIGEST=1 and RESEND_API_KEY in the Trigger.dev environment; without
 * them the run still completes and the output says the digest was skipped.
 */

async function runAndDigest(opts: { dryRun: boolean; slug?: string }) {
  const db = createAdminClient()
  const startedAt = new Date()
  const summaries = await runAllSources(db, opts)
  log(summaries, opts.dryRun)

  if (opts.dryRun) return { summaries, digest: 'skipped_dry_run' as const }
  const digest = await sendRunDigest(db, summaries, startedAt, {
    enabled: process.env.SYNC_DIGEST === '1',
    appUrl: process.env.NEXT_PUBLIC_APP_URL || 'https://jobs.monashmss.com',
    send: (m) => sendEmail({ from: m.from, to: m.to, subject: m.subject, html: m.html, text: m.text }, 'sync digest'),
  })
  if (typeof digest === 'object') logger.error('Digest email failed', { error: digest.failed })
  else logger.info('Digest', { outcome: digest })
  return { summaries, digest }
}

function log(summaries: WorkerSummary[], dryRun: boolean) {
  for (const s of summaries) {
    const fields = { source: s.slug, dryRun, ...s.counts, zeroGuardTripped: s.zeroGuardTripped }
    if (s.error) logger.error('Source failed', { ...fields, error: s.error })
    else if (s.zeroGuardTripped) logger.warn('Source returned far fewer postings than usual', fields)
    else logger.info('Source synced', fields)
  }
}

export const syncTask = schedules.task({
  id: 'job-board-sync',
  cron: { pattern: '0 2 * * *', timezone: 'Australia/Melbourne' },
  maxDuration: 3600,
  run: async () => runAndDigest({ dryRun: false }),
})

export const syncManualTask = task({
  id: 'job-board-sync-manual',
  maxDuration: 3600,
  run: async (payload: { slug?: string; dryRun?: boolean }) => {
    // Dry-run unless explicitly told otherwise: a hand-triggered run is
    // almost always "does this new source parse?", and the safe answer to
    // a missing flag is "write nothing".
    const dryRun = payload.dryRun !== false
    return { dryRun, ...(await runAndDigest({ dryRun, slug: payload.slug })) }
  },
})
