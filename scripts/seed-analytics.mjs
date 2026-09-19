#!/usr/bin/env node
/**
 * Fills a *local* database with plausible analytics history.
 *
 * The dashboard is the one admin page that cannot be judged against an empty
 * database: every tile, delta, sparkline and funnel step is a shape, and with
 * no events they all collapse to the same empty state. A fresh `supabase start`
 * has no events at all, so there was no way to look at the page and see whether
 * it worked.
 *
 * Refuses to run against anything but 127.0.0.1/localhost — this writes
 * thousands of fabricated rows, and doing that to the hosted project would
 * corrupt the only real engagement history the society has.
 *
 * Usage:  node scripts/seed-analytics.mjs [--days 190] [--reset]
 */

import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const DEFAULT_DAYS = 190
const BATCH_SIZE = 1000

/** Melbourne, like every other reporting path in the app. */
const TIMEZONE = 'Australia/Melbourne'

const args = process.argv.slice(2)
const days = Number(valueOf('--days') ?? DEFAULT_DAYS)
const reset = args.includes('--reset')

const { url, serviceKey } = readEnv()

if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(url)) {
  console.error(
    `Refusing to seed ${url} — this script only ever writes to a local Supabase.`
  )
  process.exit(1)
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })

const { data: jobs, error: jobsError } = await supabase
  .from('jobs')
  .select('id, title, job_type')

if (jobsError) throw jobsError
if (!jobs?.length) {
  console.error('No jobs in the database — seed jobs first, events hang off them.')
  process.exit(1)
}

if (reset) {
  // `neq` on the primary key rather than a bare delete: PostgREST refuses an
  // unfiltered DELETE, which is a guard worth keeping rather than working
  // around with a raw connection.
  const { error } = await supabase.from('analytics_events').delete().gte('id', 0)
  if (error) throw error
  console.log('Cleared existing analytics_events.')
}

/**
 * Interest is not uniform across the board. Internships and graduate roles are
 * what a marketing society's audience is mostly there for, so they carry the
 * traffic; the rest fill in behind them. Weighting here rather than sampling
 * jobs evenly is what makes the interest charts say something.
 */
const JOB_TYPE_WEIGHT = {
  internship: 5,
  graduate: 4,
  'part-time': 2,
  casual: 1.5,
  contract: 1,
  'full-time': 2,
}

const weightedJobs = jobs.flatMap((job) => {
  const weight = Math.round((JOB_TYPE_WEIGHT[job.job_type] ?? 1) * 2)
  return Array.from({ length: weight }, () => job)
})

/**
 * A returning audience, not a fresh crowd every day. The pool is deliberately
 * smaller than the total visit count so repeat visitors exist — otherwise
 * "distinct viewers" and "job views" would be the same series and the gap the
 * chart is drawn to show would never appear.
 */
const visitors = Array.from({ length: 900 }, () => randomUUID())

const rows = []
const today = new Date()

for (let dayOffset = days - 1; dayOffset >= 0; dayOffset--) {
  const date = new Date(today)
  date.setDate(date.getDate() - dayOffset)

  const weekday = date.getDay()
  const isWeekend = weekday === 0 || weekday === 6

  // Term rhythm: a slow climb across the period so the period-over-period
  // deltas have something real to report, plus day-to-day noise so the
  // sparklines are a shape rather than a ramp.
  const progress = (days - 1 - dayOffset) / (days - 1)
  const trend = 26 + progress * 30
  const dayFactor = (isWeekend ? 0.45 : 1) * (0.7 + Math.random() * 0.6)
  const views = Math.max(2, Math.round(trend * dayFactor))

  const dailyVisitors = pickDistinct(visitors, Math.max(2, Math.round(views * 0.62)))

  for (let i = 0; i < views; i++) {
    const visitor = dailyVisitors[i % dailyVisitors.length]
    const job = weightedJobs[Math.floor(Math.random() * weightedJobs.length)]

    rows.push(event('view', job.id, visitor, date))

    // How long they stayed on it. Most listings get a skim; a minority get
    // read properly, which is what makes the average worth reporting at all.
    // Log-normal-ish rather than uniform, because real reading time is.
    const skim = Math.random() < 0.55
    const seconds = skim
      ? 5 + Math.random() * 35
      : 45 + Math.random() * 240 * (0.5 + progress)
    rows.push({
      ...event('dwell', job.id, visitor, date),
      duration_ms: Math.round(seconds * 1000),
    })

    // The funnel, one visitor at a time. Each step is conditional on the one
    // above it, so the seeded data obeys the same ordering the dashboard's
    // funnel asserts — views ≥ clicks ≥ apply clicks ≥ confirmations.
    if (Math.random() < 0.23) {
      rows.push(event('click', job.id, visitor, date))

      if (Math.random() < 0.34) {
        rows.push(event('apply', job.id, visitor, date))

        if (Math.random() < 0.19) {
          rows.push(event('apply_confirmed', job.id, visitor, date))
        }
      }
    }

    if (Math.random() < 0.03) {
      rows.push(event('share', job.id, visitor, date))
    }
  }
}

console.log(`Inserting ${rows.length.toLocaleString()} events across ${days} days…`)

for (let i = 0; i < rows.length; i += BATCH_SIZE) {
  const batch = rows.slice(i, i + BATCH_SIZE)
  const { error } = await supabase.from('analytics_events').insert(batch)
  if (error) throw error
  process.stdout.write(`\r  ${Math.min(i + BATCH_SIZE, rows.length)} / ${rows.length}`)
}

console.log(`\nDone. Reporting timezone is ${TIMEZONE}.`)

// ---------------------------------------------------------------------------

function event(type, jobId, visitorId, date) {
  // Spread through the waking day rather than piling on midnight, so daily
  // buckets in Melbourne time land where a reader would expect them to.
  const at = new Date(date)
  at.setHours(8 + Math.floor(Math.random() * 14), Math.floor(Math.random() * 60), 0, 0)

  return {
    event_type: type,
    job_id: jobId,
    visitor_id: visitorId,
    occurred_at: at.toISOString(),
  }
}

function pickDistinct(pool, count) {
  const picked = new Set()
  while (picked.size < Math.min(count, pool.length)) {
    picked.add(pool[Math.floor(Math.random() * pool.length)])
  }
  return [...picked]
}

function valueOf(flag) {
  const index = args.indexOf(flag)
  return index === -1 ? undefined : args[index + 1]
}

function readEnv() {
  const file = readFileSync('.env.local', 'utf8')
  const read = (key) =>
    process.env[key] ??
    file
      .split('\n')
      .find((line) => line.trim().startsWith(`${key}=`))
      ?.split('=')
      .slice(1)
      .join('=')
      .trim()

  const url = read('NEXT_PUBLIC_SUPABASE_URL')
  const serviceKey = read('SUPABASE_SERVICE_ROLE_KEY')

  if (!url || !serviceKey) {
    console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.')
    process.exit(1)
  }

  return { url, serviceKey }
}
