/**
 * The LinkedIn adapter: Bright Data's "LinkedIn job listings -- discover by
 * keyword" dataset (`gd_lpfll7v5hcqtkxl6l`), read with MMSS's permission
 * (recorded as `config.consent` on the source, 3 Oct 2026).
 *
 * One fetch is three steps, all inside the Trigger.dev run:
 *   1. POST /datasets/v3/trigger with every search input from
 *      linkedin-config.ts -> a snapshot id
 *   2. poll GET /datasets/v3/snapshot/<id>: 202 `{status:"running"}` until
 *      the data is ready (about a minute for one input, verified live)
 *   3. the same request answers 200 with a JSON array of records
 *
 * Polling, not Bright Data's webhook: the run then flows through the same
 * processSource() as every ATS source -- dedup, targeting, risk, sync_runs,
 * the digest -- with no public endpoint or second secret, and no 4.5 MB
 * Vercel request-body limit to hit (a record is ~10 KB with its
 * description, so a full run's payload would be close to it). `/progress`
 * isn't used: it hung for over a minute on 3 Oct 2026 while `/snapshot`
 * answered in under a second.
 *
 * Budget: every snapshot is written to the ledger before it is polled, so a
 * dry run's spend counts and a run that dies waiting doesn't pay again --
 * the next run collects the same snapshot (`findResumable`). When the
 * month's remaining records can't cover every input at LIMIT_PER_INPUT, the
 * per-input limit shrinks to fit; below one record per input the run
 * refuses, and that refusal is the run's recorded error.
 *
 * Verified fields (live, 3 Oct 2026): `job_posting_id`, `url` (the LinkedIn
 * job page), `apply_link` (null when the apply button stays on LinkedIn),
 * `job_title`, `company_name`, `job_location` ("Melbourne, Victoria,
 * Australia"), `job_description_formatted` (HTML), `job_summary` (plain
 * text), `job_seniority_level`, `job_employment_type`, `job_posted_date`
 * (ISO), `application_availability`. Error records (include_errors) carry
 * `error`/`error_code` and no posting id.
 */

import {
  LIMIT_PER_INPUT,
  MAX_EXCLUDED_IDS,
  MONTHLY_RECORD_CAP,
  searchInputs,
  type LinkedInSearchInput,
} from './linkedin-config'
import type { Adapter, AdapterContext, RawPosting, SourceRow } from './types'

export const DATASET_ID = 'gd_lpfll7v5hcqtkxl6l'
const API = 'https://api.brightdata.com/datasets/v3'

const REQUEST_TIMEOUT_MS = 60_000
const POLL_INTERVAL_MS = 30_000
/** Well inside the task's 1-hour maxDuration. A snapshot still running after this is resumed next run. */
const MAX_WAIT_MS = 40 * 60_000
/** Consecutive failed polls (timeouts, 5xx) before giving up on this run. */
const MAX_POLL_FAILURES = 5

/** The snapshot isn't lost, only not ready (or not reachable) yet: the next run collects it. */
export class SnapshotPendingError extends Error {}

export interface LinkedInRecord {
  job_posting_id?: string
  url?: string
  apply_link?: string | null
  job_title?: string
  company_name?: string
  company_logo?: string | null
  job_location?: string | null
  job_summary?: string | null
  job_description_formatted?: string | null
  job_seniority_level?: string | null
  job_employment_type?: string | null
  job_base_pay_range?: string | null
  job_posted_date?: string | null
  job_num_applicants?: number | null
  application_availability?: boolean | null
  error?: string
  error_code?: string
}

export interface LinkedInDeps {
  fetch: typeof globalThis.fetch
  apiKey: () => string | undefined
  now: () => number
}

const defaultDeps: LinkedInDeps = {
  fetch: (...args) => globalThis.fetch(...args),
  apiKey: () => process.env.BRIGHTDATA_API_KEY,
  now: () => Date.now(),
}

/** A number from `config`, or the code default when unset. */
function configNumber(source: SourceRow, key: string, fallback: number): number {
  const value = source.config[key]
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}

/**
 * The per-input record limit this run can afford: LIMIT_PER_INPUT, or less
 * when the month's remainder can't cover every input at that. Null means
 * not even one record per input fits -- don't run.
 */
export function affordableLimit(used: number, cap: number, inputCount: number, wanted: number): number | null {
  if (inputCount === 0) return null
  const limit = Math.min(wanted, Math.floor((cap - used) / inputCount))
  return limit >= 1 ? limit : null
}

/** The apply link when LinkedIn hands off to the employer, otherwise the LinkedIn job page. */
export function linkedInApplyUrl(record: LinkedInRecord): string | null {
  for (const candidate of [record.apply_link, record.url]) {
    if (!candidate) continue
    try {
      const url = new URL(candidate)
      if (url.protocol === 'https:' || url.protocol === 'http:') return url.toString()
    } catch {
      // not a URL; try the next
    }
  }
  return null
}

/** Records that become postings: real jobs, still taking applications, with a title, company and link. */
export function toPostings(records: LinkedInRecord[]): RawPosting[] {
  const postings: RawPosting[] = []
  for (const record of records) {
    if (record.error || record.error_code || !record.job_posting_id) continue
    if (record.application_availability === false) continue // closed on LinkedIn
    const applyUrl = linkedInApplyUrl(record)
    const title = record.job_title?.trim()
    const company = record.company_name?.trim()
    if (!applyUrl || !title || !company) continue

    const read = new Set(['title', 'company', 'applyUrl'])
    if (record.job_location) read.add('location')
    if (record.job_description_formatted || record.job_summary) read.add('description')
    if (record.job_employment_type) read.add('job_type')

    postings.push({
      sourceJobId: record.job_posting_id,
      applyUrl,
      title,
      company,
      raw: record as Record<string, unknown>,
      read,
    })
  }
  return postings
}

export function createLinkedInAdapter(deps: LinkedInDeps = defaultDeps): Adapter {
  async function call(path: string, init: RequestInit = {}): Promise<Response> {
    const key = deps.apiKey()
    if (!key) throw new Error('BRIGHTDATA_API_KEY is not set in this environment')
    return deps.fetch(`${API}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...init.headers },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  }

  async function trigger(inputs: LinkedInSearchInput[], limit: number): Promise<string> {
    const params = new URLSearchParams({
      dataset_id: DATASET_ID,
      type: 'discover_new',
      discover_by: 'keyword',
      include_errors: 'true',
      limit_per_input: String(limit),
    })
    const res = await call(`/trigger?${params}`, { method: 'POST', body: JSON.stringify(inputs) })
    const body = (await res.json().catch(() => null)) as { snapshot_id?: string } | null
    if (!res.ok || !body?.snapshot_id) {
      throw new Error(`Bright Data trigger failed (${res.status}): ${JSON.stringify(body).slice(0, 300)}`)
    }
    return body.snapshot_id
  }

  /** The snapshot's records once ready. Throws if it fails, or is still running after MAX_WAIT_MS. */
  async function collect(snapshotId: string, ctx: AdapterContext): Promise<LinkedInRecord[]> {
    const deadline = deps.now() + MAX_WAIT_MS
    let failures = 0
    for (;;) {
      let res: Response | null = null
      try {
        res = await call(`/snapshot/${encodeURIComponent(snapshotId)}?format=json`)
      } catch {
        res = null // timeout or network error: count it, keep polling
      }

      if (res?.status === 200) {
        const body: unknown = await res.json()
        if (Array.isArray(body)) return body as LinkedInRecord[]
        throw new Error(`Bright Data snapshot ${snapshotId} returned ${JSON.stringify(body).slice(0, 300)}`)
      }
      if (res?.status === 202) {
        failures = 0
      } else if (res && res.status >= 400 && res.status < 500) {
        const text = await res.text().catch(() => '')
        throw new Error(`Bright Data snapshot ${snapshotId} failed (${res.status}): ${text.slice(0, 300)}`)
      } else if (++failures >= MAX_POLL_FAILURES) {
        throw new SnapshotPendingError(`Bright Data snapshot ${snapshotId}: ${failures} polls in a row failed; it will be collected next run`)
      }

      if (deps.now() >= deadline) {
        throw new SnapshotPendingError(`Bright Data snapshot ${snapshotId} still running after ${MAX_WAIT_MS / 60_000} min; it will be collected next run`)
      }
      await ctx.sleep(POLL_INTERVAL_MS)
    }
  }

  return {
    kind: 'aggregator',

    async fetch(source: SourceRow, ctx?: AdapterContext): Promise<RawPosting[]> {
      if (!ctx) throw new Error('The LinkedIn adapter needs a spend ledger; run it through the worker')
      const { ledger } = ctx

      let snapshotId: string
      const resumable = await ledger.findResumable()
      if (resumable) {
        snapshotId = resumable.snapshotId
      } else {
        const cap = configNumber(source, 'monthly_cap', MONTHLY_RECORD_CAP)
        const wanted = configNumber(source, 'limit_per_input', LIMIT_PER_INPUT)
        const exclude = await ledger.recentPostingIds(MAX_EXCLUDED_IDS)
        const inputs = searchInputs().map((input) => (exclude.length > 0 ? { ...input, jobs_to_not_include: exclude } : input))
        const used = await ledger.recordsThisMonth()
        const limit = affordableLimit(used, cap, inputs.length, wanted)
        if (limit === null) {
          throw new Error(`LinkedIn monthly budget reached: ${used} of ${cap} records used; skipped until next month`)
        }
        snapshotId = await trigger(inputs, limit)
        // Logged without the exclusion list, which only repeats ledger data.
        const logged = inputs.map(({ jobs_to_not_include: _, ...rest }) => rest)
        await ledger.triggered({ snapshotId, inputs: logged, maxRecords: inputs.length * limit, dryRun: ctx.dryRun })
      }

      let records: LinkedInRecord[]
      try {
        records = await collect(snapshotId, ctx)
      } catch (e) {
        // Still running or unreachable: leave it 'triggered' so the next run collects it.
        if (!(e instanceof SnapshotPendingError)) {
          await ledger.finished(snapshotId, { status: 'failed', error: e instanceof Error ? e.message : String(e) })
        }
        throw e
      }

      const postingIds = records.map((r) => r.job_posting_id).filter((id): id is string => Boolean(id))
      await ledger.finished(snapshotId, { status: 'collected', records: records.length, postingIds })
      return toPostings(records)
    },
  }
}

export const linkedInAdapter = createLinkedInAdapter()
