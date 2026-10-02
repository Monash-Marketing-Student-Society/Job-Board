'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowSquareOutIcon, PauseIcon, PlayIcon } from '@phosphor-icons/react'
import { Button, NativeSelect, NativeSelectOption, useConfirmDialog } from '@/components/ui'
import { GridRow, headerLabelClassName } from './table'
import { StatusDot, type StatusDotRole } from './table/status-dot'
import { cn } from '@/lib/utils'
import {
  SOAK_MAX_REJECT_RATE,
  rejectRate,
  type PublishMode,
  type ReviewTally,
  type RunHealth,
  type RunRow,
  type SourcePatch,
} from '@/lib/sync/source-admin'

/**
 * /admin/sources: one row per employer feed, with what an admin needs to
 * decide whether to trust it -- how its last runs went, how its held jobs
 * have been reviewed -- next to the three levers: tier (demote), enabled
 * (pause) and auto-publish.
 *
 * The publishing column shows what will actually happen to a clean posting,
 * not just the switch position: risk.ts still holds a tier B/C source's
 * postings, and the first ten from any source, with auto-publish on. A
 * switch that reads "on" while everything is still held would be a lie.
 */

export interface SourceView {
  id: string
  slug: string
  name: string
  tier: 'A' | 'B' | 'C'
  endpoint: string
  vendor: string | null
  /** Read on the employer's explicit say-so rather than its robots.txt (lib/sync/robots.ts). */
  explicitConsent: boolean
  enabled: boolean
  autoPublish: boolean
  usualCount: number | null
  runs: RunRow[]
  health: RunHealth
  mode: PublishMode
  reviews: ReviewTally
}

/** Literal for Tailwind's JIT scanner: source / last run / review / tier / publishing / status. */
const SOURCES_GRID_COLUMNS = 'grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_176px_76px_200px_116px]'

/** B and C hold every posting for review (risk.ts tier_b_or_c); A is the only tier that can auto-publish. */
const TIER_HINT = 'A publishes normally. B and C hold every job for review.'

/** Run times are for Melbourne-based admins; the schedule is set in Melbourne time too. */
const runTimeFormat = new Intl.DateTimeFormat('en-AU', {
  timeZone: 'Australia/Melbourne',
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
})

function healthDot(health: RunHealth, usualCount: number | null): { role: StatusDotRole; label: string; detail?: string } {
  switch (health.state) {
    case 'never':
      return { role: 'muted', label: 'New', detail: 'Has not run yet.' }
    case 'failed':
      return { role: 'destructive', label: 'Failed', detail: health.error }
    case 'low':
      return {
        role: 'warning',
        label: 'Low',
        detail: `Far fewer postings than usual${usualCount != null ? ` (~${usualCount})` : ''}. The feed may be broken.`,
      }
    case 'stale':
      return { role: 'warning', label: 'Overdue', detail: 'No run in the last 36 hours. Check the Trigger.dev schedule.' }
    case 'ok':
      return { role: 'success', label: 'OK' }
  }
}

function runRole(run: RunRow): StatusDotRole {
  if (run.error) return 'destructive'
  if (run.zero_guard_tripped) return 'warning'
  return 'success'
}

const DOT_FILL: Record<StatusDotRole, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  destructive: 'bg-destructive',
  muted: 'bg-muted-foreground/50',
}

function modeCaption(mode: PublishMode): { text: string; tone: 'muted' | 'warning' | 'success' } {
  switch (mode.mode) {
    case 'paused':
      return { text: 'Paused. Nothing is fetched.', tone: 'muted' }
    case 'review_only':
      return { text: 'Every job waits for review.', tone: 'muted' }
    case 'held_by_tier':
      return { text: 'On, but a tier B/C source is always held.', tone: 'warning' }
    case 'warming_up':
      return {
        text: `On. Held until ${mode.needed} jobs are published (${mode.published} so far).`,
        tone: 'warning',
      }
    case 'auto':
      return { text: 'Clean jobs publish unattended.', tone: 'success' }
  }
}

function LastRun({ row }: { row: SourceView }) {
  const last = row.runs[0]
  const dot = healthDot(row.health, row.usualCount)
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5">
        <StatusDot role={dot.role} label={dot.label} />
        {last && (
          <span className="text-xs text-muted-foreground tabular-nums">{runTimeFormat.format(new Date(last.started_at))}</span>
        )}
      </div>
      {last && !last.error && (
        <p className="mt-0.5 text-xs text-slate-600 tabular-nums">
          {last.seen} seen · {last.held} held · {last.created} published · {last.rejected} off-target
          {last.deduped > 0 && ` · ${last.deduped} dupes`}
        </p>
      )}
      {dot.detail && <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2 break-words">{dot.detail}</p>}
      {row.runs.length > 1 && (
        <div className="mt-1.5 flex items-center gap-1" aria-label={`Last ${row.runs.length} runs, newest first`}>
          {row.runs.map((run) => (
            <span
              key={run.started_at}
              title={`${runTimeFormat.format(new Date(run.started_at))}: ${run.error ? 'failed' : `${run.seen} seen, ${run.held} held`}`}
              className={cn('size-1.5 rounded-full', DOT_FILL[runRole(run)])}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function Reviews({ tally, windowDays }: { tally: ReviewTally; windowDays: number }) {
  const rate = rejectRate(tally)
  const over = rate != null && rate > SOAK_MAX_REJECT_RATE
  return (
    <div className="min-w-0 text-xs">
      {tally.pending > 0 ? (
        <Link href="/admin/submissions" className="font-medium text-primary hover:underline">
          {tally.pending} waiting
        </Link>
      ) : (
        <span className="text-muted-foreground">None waiting</span>
      )}
      <p className="mt-0.5 text-slate-600 tabular-nums" title={`Decided in the last ${windowDays} days`}>
        {tally.approved} ok · {tally.rejected} rejected
        {rate != null && (
          <span className={cn('ml-1', over ? 'text-destructive font-medium' : 'text-muted-foreground')}>
            ({Math.round(rate * 100)}%)
          </span>
        )}
      </p>
    </div>
  )
}

function Switch({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean
  disabled?: boolean
  label: string
  onChange: (next: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
        'disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-primary' : 'bg-slate-300'
      )}
    >
      <span
        className={cn(
          'inline-block size-4 rounded-full bg-white shadow-sm transition-transform',
          checked ? 'translate-x-[18px]' : 'translate-x-0.5'
        )}
      />
    </button>
  )
}

function Publishing({ row, busy, onToggle }: { row: SourceView; busy: boolean; onToggle: (next: boolean) => void }) {
  const caption = modeCaption(row.mode)
  return (
    <div className="flex items-start gap-2.5">
      <Switch checked={row.autoPublish} disabled={busy} label={`Auto-publish ${row.name}`} onChange={onToggle} />
      <p
        className={cn(
          'text-xs leading-5',
          caption.tone === 'warning' && 'text-warning',
          caption.tone === 'success' && 'text-success',
          caption.tone === 'muted' && 'text-muted-foreground'
        )}
      >
        {caption.text}
      </p>
    </div>
  )
}

function TierSelect({ row, busy, onChange }: { row: SourceView; busy: boolean; onChange: (tier: SourceView['tier']) => void }) {
  return (
    <NativeSelect
      aria-label={`Tier for ${row.name}`}
      title={TIER_HINT}
      value={row.tier}
      disabled={busy}
      onChange={(e) => onChange(e.target.value as SourceView['tier'])}
      className="h-8 rounded-lg pl-2.5 pr-7 text-xs"
    >
      {(['A', 'B', 'C'] as const).map((t) => (
        <NativeSelectOption key={t} value={t}>
          {t}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  )
}

function PauseButton({ row, busy, onChange }: { row: SourceView; busy: boolean; onChange: (enabled: boolean) => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      disabled={busy}
      onClick={() => onChange(!row.enabled)}
      className="h-8 gap-1.5 rounded-lg bg-slate-100 px-3 text-xs text-slate-700 hover:bg-slate-200/70"
    >
      {row.enabled ? <PauseIcon weight="fill" className="size-3.5" /> : <PlayIcon weight="fill" className="size-3.5" />}
      {row.enabled ? 'Pause' : 'Resume'}
    </Button>
  )
}

function SourceName({ row }: { row: SourceView }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1">
        <p className="text-sm font-medium text-slate-800 truncate">{row.name}</p>
        <a
          href={row.endpoint}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open the feed for ${row.name}`}
          title={row.endpoint}
          className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
        >
          <ArrowSquareOutIcon className="size-3.5" />
        </a>
      </div>
      <p className="text-xs text-muted-foreground truncate">
        {[row.vendor, row.slug].filter(Boolean).join(' · ')}
        {row.explicitConsent && (
          <span className="ml-1.5" title="The employer approved MMSS reading this feed directly, so its robots.txt is not checked.">
            · explicit consent
          </span>
        )}
        {!row.enabled && <span className="ml-1.5 font-medium text-slate-500">Paused</span>}
      </p>
    </div>
  )
}

export function SourcesTable({ rows, reviewWindowDays }: { rows: SourceView[]; reviewWindowDays: number }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const { confirm, dialog } = useConfirmDialog()

  const save = (row: SourceView, patch: SourcePatch, successText: string) => {
    setBusyId(row.id)
    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin/sources/${row.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        })
        const payload = await res.json().catch(() => ({}))
        if (!res.ok) {
          toast.error(payload.error || 'Could not save the change')
          if (res.status === 409) router.refresh()
          return
        }
        toast.success(successText)
        router.refresh()
      } finally {
        setBusyId(null)
      }
    })
  }

  const setEnabled = (row: SourceView, enabled: boolean) =>
    save(
      row,
      { enabled },
      enabled ? `${row.name} resumed. It runs again tonight.` : `${row.name} paused. Tonight's run skips it.`
    )

  const setTier = (row: SourceView, tier: SourceView['tier']) =>
    save(
      row,
      { tier },
      tier === 'A' ? `${row.name} is tier A again.` : `${row.name} demoted to tier ${tier}. Its jobs are all held for review.`
    )

  const setAutoPublish = async (row: SourceView, on: boolean) => {
    if (!on) {
      save(row, { auto_publish: false }, `${row.name} is review-only again.`)
      return
    }

    const { approved, rejected } = row.reviews
    const decided = approved + rejected
    const rate = rejectRate(row.reviews)
    const warnings: string[] = []
    if (decided < 5) warnings.push(`Only ${decided} of its jobs have been reviewed in the last ${reviewWindowDays} days.`)
    if (rate != null && rate > SOAK_MAX_REJECT_RATE)
      warnings.push(`${Math.round(rate * 100)}% were rejected, above the 10% bar for leaving review-only.`)
    if (row.health.state !== 'ok') warnings.push('Its last run was not clean.')
    if (row.tier !== 'A') warnings.push(`It is tier ${row.tier}, so its jobs stay held until it goes back to tier A.`)

    const { confirmed } = await confirm({
      title: `Auto-publish ${row.name}?`,
      description:
        `Jobs that pass every risk check go live without review, from tonight's run. ` +
        `Anything risky is still held, and so are the first 10 jobs from any source. ` +
        `Last ${reviewWindowDays} days: ${approved} approved, ${rejected} rejected.`,
      warning: warnings.length > 0 ? warnings.join(' ') : undefined,
      confirmLabel: 'Turn on auto-publish',
    })
    if (!confirmed) return
    save(row, { auto_publish: true }, `Auto-publish is on for ${row.name}.`)
  }

  if (rows.length === 0) {
    return (
      <p className="px-2 py-6 text-sm text-slate-500">
        No sources yet. A source is a row in the <code>sources</code> table, added by migration.
      </p>
    )
  }

  return (
    <div>
      <div role="table" aria-label="Sync sources" className="hidden lg:block">
        <GridRow header columnsClassName={SOURCES_GRID_COLUMNS}>
          <div className={cn('px-3', headerLabelClassName)}>Source</div>
          <div className={cn('px-3', headerLabelClassName)}>Last run</div>
          <div className={cn('px-3', headerLabelClassName)}>Review ({reviewWindowDays}d)</div>
          <div className={cn('px-3', headerLabelClassName)}>Tier</div>
          <div className={cn('px-3', headerLabelClassName)}>Auto-publish</div>
          <div className="px-3">
            <span className="sr-only">Pause or resume</span>
          </div>
        </GridRow>

        <div className="pt-1">
          {rows.map((row) => {
            const busy = busyId === row.id
            return (
              <GridRow
                key={row.id}
                columnsClassName={SOURCES_GRID_COLUMNS}
                className={cn('items-start', !row.enabled && 'opacity-70')}
              >
                <div className="min-w-0 px-3 py-3">
                  <SourceName row={row} />
                </div>
                <div className="min-w-0 px-3 py-3">
                  <LastRun row={row} />
                </div>
                <div className="min-w-0 px-3 py-3">
                  <Reviews tally={row.reviews} windowDays={reviewWindowDays} />
                </div>
                <div className="px-3 py-2.5">
                  <TierSelect row={row} busy={busy} onChange={(tier) => setTier(row, tier)} />
                </div>
                <div className="px-3 py-3">
                  <Publishing row={row} busy={busy} onToggle={(on) => setAutoPublish(row, on)} />
                </div>
                <div className="flex justify-end px-3 py-2.5">
                  <PauseButton row={row} busy={busy} onChange={(enabled) => setEnabled(row, enabled)} />
                </div>
              </GridRow>
            )
          })}
        </div>
      </div>

      {/* Below lg the six columns leave nothing for the run detail -- stacked cards,
          the same breakpoint the other admin tables switch at. */}
      <div className="lg:hidden space-y-2">
        {rows.map((row) => {
          const busy = busyId === row.id
          return (
            <div key={row.id} className={cn('rounded-xl bg-slate-50 p-3 space-y-3', !row.enabled && 'opacity-70')}>
              <div className="flex items-start justify-between gap-3">
                <SourceName row={row} />
                <PauseButton row={row} busy={busy} onChange={(enabled) => setEnabled(row, enabled)} />
              </div>
              <LastRun row={row} />
              <Reviews tally={row.reviews} windowDays={reviewWindowDays} />
              <div className="flex flex-wrap items-start gap-3">
                <div className="w-32">
                  <TierSelect row={row} busy={busy} onChange={(tier) => setTier(row, tier)} />
                </div>
                <div className="min-w-0 flex-1 pt-1.5">
                  <Publishing row={row} busy={busy} onToggle={(on) => setAutoPublish(row, on)} />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {dialog}
    </div>
  )
}
