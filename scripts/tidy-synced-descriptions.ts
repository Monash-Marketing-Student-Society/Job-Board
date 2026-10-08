/**
 * One-off backfill: runs sanitizeSyncedDescription (lib/sanitize.ts) over
 * descriptions the sync wrote before it existed -- live synced jobs and the
 * pending review queue. Human jobs (manual, submission) are never read.
 *
 *   npx tsx scripts/tidy-synced-descriptions.ts           # dry run: counts only
 *   npx tsx scripts/tidy-synced-descriptions.ts --apply   # writes, after a backup
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for the
 * database to change. `--apply` first writes every original description to
 * tidy-synced-descriptions.backup-<timestamp>.json in the working directory;
 * nothing else can restore them. Safe to re-run: the tidy is idempotent, so a
 * second pass only touches rows synced in between.
 */
import { writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { sanitizeSyncedDescription } from '../lib/sanitize'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}
const apply = process.argv.includes('--apply')
const db = createClient(url, key, { auth: { persistSession: false } })

async function main() {
  const { data: jobs, error: jobsError } = await db
    .from('jobs')
    .select('id, source, description')
    .like('source', 'sync:%')
    .not('description', 'is', null)
  if (jobsError) throw new Error(`jobs: ${jobsError.message}`)

  const { data: staged, error: stagedError } = await db
    .from('staged_jobs')
    .select('id, normalised')
    .eq('status', 'pending')
  if (stagedError) throw new Error(`staged_jobs: ${stagedError.message}`)

  const jobChanges = (jobs ?? [])
    .map((j) => ({ id: j.id as string, before: j.description as string, after: sanitizeSyncedDescription(j.description) }))
    .filter((c) => c.after !== c.before)
  const stagedChanges = (staged ?? [])
    .filter((s) => s.normalised?.description)
    .map((s) => ({ id: s.id as string, normalised: s.normalised, before: s.normalised.description as string, after: sanitizeSyncedDescription(s.normalised.description) }))
    .filter((c) => c.after !== c.before)

  console.log(`Live synced jobs: ${jobChanges.length} of ${jobs?.length ?? 0} change`)
  console.log(`Pending review queue: ${stagedChanges.length} of ${staged?.length ?? 0} change`)
  if (!apply) {
    console.log('Dry run. Re-run with --apply to write.')
    return
  }

  const backup = `tidy-synced-descriptions.backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  writeFileSync(
    backup,
    JSON.stringify({
      jobs: jobChanges.map(({ id, before }) => ({ id, description: before })),
      staged_jobs: stagedChanges.map(({ id, before }) => ({ id, description: before })),
    }, null, 2)
  )
  console.log(`Backup written to ${backup}`)

  for (const c of jobChanges) {
    // The source predicate again, so a human job can't be written even by mistake.
    const { error } = await db.from('jobs').update({ description: c.after || null }).eq('id', c.id).like('source', 'sync:%')
    if (error) throw new Error(`jobs ${c.id}: ${error.message}`)
  }
  for (const c of stagedChanges) {
    const { error } = await db
      .from('staged_jobs')
      .update({ normalised: { ...c.normalised, description: c.after || null } })
      .eq('id', c.id)
      .eq('status', 'pending')
    if (error) throw new Error(`staged_jobs ${c.id}: ${error.message}`)
  }
  console.log('Done.')
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
