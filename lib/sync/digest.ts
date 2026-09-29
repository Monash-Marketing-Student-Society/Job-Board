/**
 * The run digest: one email per sync run to partnerships@, listing every job
 * the run held for review and any source that broke. It's how the PRD's third
 * requirement is met -- risky or incomplete jobs are held AND notified -- and
 * one mail a run (not one a job) keeps inside Resend's free daily allowance.
 *
 * Sent only when something needs a human: a held job, a source error, or a
 * tripped zero-result guard. A quiet night sends nothing, so an email from
 * this always means "go and look".
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { PARTNERSHIPS_EMAIL } from '../utils'
import { syncDigestEmail, type SyncDigestData } from '../email-templates'
import { riskReasonLabel } from './risk'
import type { WorkerSummary } from './worker'

export interface HeldJob {
  title: string
  company: string
  location: string | null
  source: string
  reasons: string[]
}

export interface DigestMessage {
  subject: string
  html: string
  text: string
}

/**
 * 'review_only_mode' is on every job while a source is in its soak, so it
 * says nothing about this job in particular -- same reasoning as the queue.
 */
const UNINFORMATIVE = new Set(['review_only_mode'])

function problemsOf(summaries: WorkerSummary[]): SyncDigestData['problems'] {
  const problems: SyncDigestData['problems'] = []
  for (const s of summaries) {
    if (s.error) problems.push({ name: s.name, issue: `Run failed: ${s.error}` })
    else if (s.zeroGuardTripped)
      problems.push({
        name: s.name,
        issue: `Returned ${s.counts.seen} posting${s.counts.seen === 1 ? '' : 's'}, far below usual. The parser may be broken; its jobs were not expired.`,
      })
  }
  return problems
}

export function needsDigest(summaries: WorkerSummary[], held: HeldJob[]): boolean {
  return held.length > 0 || problemsOf(summaries).length > 0
}

/** "Wed, 30 Sept" in Melbourne time, whatever timezone the worker runs in. */
export function runLabel(date: Date): string {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Melbourne',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(date)
}

export function buildDigest(summaries: WorkerSummary[], held: HeldJob[], appUrl: string, runDate: Date): DigestMessage {
  const queueUrl = `${appUrl.replace(/\/$/, '')}/admin/submissions`
  const heldForEmail = held.map((h) => ({
    ...h,
    reasons: h.reasons.filter((r) => !UNINFORMATIVE.has(r)).map(riskReasonLabel),
  }))
  // A job whose only reason is the soak itself still needs a line saying so.
  for (const h of heldForEmail) if (h.reasons.length === 0) h.reasons.push(riskReasonLabel('review_only_mode'))

  const problems = problemsOf(summaries)
  const data: SyncDigestData = {
    queueUrl,
    runLabel: runLabel(runDate),
    held: heldForEmail,
    problems,
    sources: summaries.map((s) => ({ name: s.name, ...s.counts })),
  }

  const parts: string[] = []
  if (held.length > 0) parts.push(`${held.length} to review`)
  if (problems.length > 0) parts.push(`${problems.length} source${problems.length === 1 ? '' : 's'} need attention`)
  const subject = `Job sync, ${data.runLabel}: ${parts.join(', ')}`

  const text = [
    `Nightly job sync, ${data.runLabel}. Nothing held is visible to students until approved.`,
    '',
    ...(held.length > 0
      ? ['HELD FOR REVIEW', ...heldForEmail.map((h) => `- ${[h.title, h.company, h.location, h.source].filter(Boolean).join(' · ')}\n  Held: ${h.reasons.join(', ')}`), '']
      : []),
    ...(problems.length > 0 ? ['SOURCES THAT NEED ATTENTION', ...problems.map((p) => `- ${p.name}: ${p.issue}`), ''] : []),
    `Review queue: ${queueUrl}`,
  ].join('\n')

  return { subject, html: syncDigestEmail(data), text }
}

/** Jobs this run staged, still pending -- the run's own held list, read back from the database. */
export async function loadHeldSince(db: SupabaseClient, since: Date): Promise<HeldJob[]> {
  const { data, error } = await db
    .from('staged_jobs')
    .select('normalised, risk_reasons, sources(name)')
    .eq('status', 'pending')
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: true })
  if (error) throw new Error(`loadHeldSince: ${error.message}`)

  return (data ?? []).map((row) => {
    const n = row.normalised as { title: string; company: string; location: string | null }
    const src = (Array.isArray(row.sources) ? row.sources[0] : row.sources) as { name: string } | null
    return { title: n.title, company: n.company, location: n.location, source: src?.name ?? 'Unknown source', reasons: row.risk_reasons ?? [] }
  })
}

export type DigestOutcome = 'sent' | 'skipped_nothing_to_report' | 'skipped_disabled' | { failed: string }

/**
 * Sends the digest for a finished run. `enabled` is SYNC_DIGEST=1, which the
 * production Trigger.dev environment sets and a developer's machine doesn't --
 * a local run must never mail the committee.
 */
export async function sendRunDigest(
  db: SupabaseClient,
  summaries: WorkerSummary[],
  startedAt: Date,
  opts: {
    enabled: boolean
    appUrl: string
    send: (msg: DigestMessage & { to: string; from: string }) => Promise<{ ok: true } | { ok: false; error: string }>
  }
): Promise<DigestOutcome> {
  if (!opts.enabled) return 'skipped_disabled'
  const held = await loadHeldSince(db, startedAt)
  if (!needsDigest(summaries, held)) return 'skipped_nothing_to_report'

  const msg = buildDigest(summaries, held, opts.appUrl, startedAt)
  const result = await opts.send({ ...msg, to: PARTNERSHIPS_EMAIL, from: 'MMSS Job Board <noreply@monashmss.com>' })
  return result.ok ? 'sent' : { failed: result.error }
}
