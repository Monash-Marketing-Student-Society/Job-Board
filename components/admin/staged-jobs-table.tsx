'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowSquareOutIcon, CheckIcon, XIcon, CaretDownIcon, FunnelIcon } from '@phosphor-icons/react'
import { Badge, Button, NativeSelect, NativeSelectOption, useConfirmDialog } from '@/components/ui'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/shadcn/dropdown-menu'
import { GridRow, IconActionButton, SelectCheckbox, softButtonClassName, headerLabelClassName } from './table'
import { cn, formatDate, decodeHtmlEntities, toApplicationHref } from '@/lib/utils'
import { riskReasonLabel } from '@/lib/sync/risk'

/**
 * Synced jobs held for review (staged_jobs), shown under the human
 * submissions on /admin/submissions. The TDD puts them on the same page, not
 * a new one: it's the same moderation job, and admins already work this queue.
 *
 * What a moderator needs per row, and nothing else: which source it came
 * from, why it was held (risk_reasons as chips -- the whole point of holding
 * it), when it closes, and a way to see the real posting. Approve publishes
 * with no email (a synced job has no submitter); reject needs a reason,
 * which is stored against the source so a source producing constant rejects
 * becomes visible, and takes a comment saying why -- what the filter is
 * tuned from during the trial.
 *
 * Deliberately not here yet: the near-duplicate warning (pg_trgm similarity
 * against live jobs from the same employer). It needs its own migration and
 * RPC, and lands as a follow-up.
 */

export interface StagedJobRow {
  id: string
  created_at: string
  risk_reasons: string[]
  normalised: {
    title: string
    company: string
    location: string | null
    url: string
    closing_at: string | null
  }
  source: { name: string; slug: string; tier: string } | null
}

/** Literal for Tailwind's JIT scanner: checkbox / job / source / closes / actions. */
const STAGED_GRID_COLUMNS = 'grid-cols-[40px_minmax(0,1fr)_128px_112px_88px]'


export const REJECT_REASONS: Array<{ value: string; label: string }> = [
  { value: 'irrelevant', label: 'Not relevant' },
  { value: 'too_senior', label: 'Too senior' },
  { value: 'experience_required', label: 'Needs 1+ year’s experience' },
  { value: 'duplicate', label: 'Duplicate' },
  { value: 'expired', label: 'Expired' },
  { value: 'employer_blocked', label: 'Employer blocked' },
  { value: 'bad_link', label: 'Bad link' },
  { value: 'other', label: 'Other' },
]

/**
 * 'review_only_mode' is on every row while a source is in its phase-1 soak,
 * so it says nothing about THIS job -- shown once in the section header
 * instead of repeated as a chip on every row.
 */
const ROW_CHIP_EXCLUDED = new Set(['review_only_mode'])

function RejectMenu({
  onReject,
  label,
  children,
}: {
  onReject: (reason: string) => void
  label: string
  children: React.ReactNode
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs text-muted-foreground">{label}</DropdownMenuLabel>
        {REJECT_REASONS.map((r) => (
          <DropdownMenuItem key={r.value} onSelect={() => onReject(r.value)}>
            {r.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function RiskChips({ reasons }: { reasons: string[] }) {
  const chips = reasons.filter((r) => !ROW_CHIP_EXCLUDED.has(r))
  if (chips.length === 0) return null
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {chips.map((reason) => (
        <Badge key={reason} variant="warning" className="rounded-full px-1.5 py-0 text-[10px] font-medium leading-4">
          {riskReasonLabel(reason)}
        </Badge>
      ))}
    </div>
  )
}

function RowActions({ onApprove, onReject }: { onApprove: () => void; onReject: (reason: string) => void }) {
  return (
    <div className="flex items-center justify-end gap-1">
      <IconActionButton label="Approve" className="text-success hover:text-success hover:bg-success/10" onClick={onApprove}>
        <CheckIcon weight="bold" className="size-4" />
      </IconActionButton>
      <RejectMenu label="Reject as…" onReject={onReject}>
        <IconActionButton
          label="Reject"
          tooltip={false}
          className="text-destructive hover:text-destructive hover:bg-destructive/10"
        >
          <XIcon weight="bold" className="size-4" />
        </IconActionButton>
      </RejectMenu>
    </div>
  )
}

/** The title: opens the job as students will see it, editable before approving. */
function PreviewLink({ id, title, className }: { id: string; title: string; className?: string }) {
  return (
    <Link
      href={`/admin/submissions/synced/${id}`}
      title="Preview and edit before publishing"
      className={cn('text-sm font-medium text-slate-800 hover:text-primary hover:underline underline-offset-2 transition-colors', className)}
    >
      {title}
    </Link>
  )
}

function PostingLink({ url, title }: { url: string; title: string }) {
  return (
    // The employer's own posting -- the thing to check before approving.
    <a
      href={toApplicationHref(url)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Open the original posting for ${title}`}
      title="Open the original posting"
      className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
    >
      <ArrowSquareOutIcon className="size-3.5" />
    </a>
  )
}

/**
 * POST a JSON body. A network failure comes back as a 503 Response rather than
 * a throw, so a row hidden before the request can be put back.
 */
async function postJson(url: string, body: unknown): Promise<Response> {
  try {
    return await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    return Response.json({ error: 'Network error. Check your connection and try again.' }, { status: 503 })
  }
}

/** Each source with rows waiting, busiest first -- the filter's options. */
function sourceOptions(rows: StagedJobRow[]): Array<{ slug: string; name: string; count: number }> {
  const bySlug = new Map<string, { slug: string; name: string; count: number }>()
  for (const row of rows) {
    if (!row.source) continue
    const entry = bySlug.get(row.source.slug) ?? { slug: row.source.slug, name: row.source.name, count: 0 }
    entry.count++
    bySlug.set(row.source.slug, entry)
  }
  return [...bySlug.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

export function StagedJobsTable({ rows }: { rows: StagedJobRow[] }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [sourceFilter, setSourceFilter] = useState('all')
  const { confirm, dialog } = useConfirmDialog()

  const remaining = rows.filter((r) => !hidden.has(r.id))
  const sourceCounts = sourceOptions(remaining)
  // Falls back to all once the filtered source's last row has been actioned.
  const activeFilter = sourceCounts.some((s) => s.slug === sourceFilter) ? sourceFilter : 'all'
  const visible = activeFilter === 'all' ? remaining : remaining.filter((r) => r.source?.slug === activeFilter)
  const allSelected = visible.length > 0 && visible.every((r) => selected.has(r.id))
  const someSelected = !allSelected && visible.some((r) => selected.has(r.id))
  const reviewOnly = rows.some((r) => r.risk_reasons.includes('review_only_mode'))

  const hide = (ids: string[]) => {
    setHidden((prev) => new Set([...prev, ...ids]))
    setSelected((prev) => new Set([...prev].filter((id) => !ids.includes(id))))
  }

  /** Puts rows back after an action on them failed -- the counterpart of hiding them up front. */
  const unhide = (ids: string[]) =>
    setHidden((prev) => new Set([...prev].filter((id) => !ids.includes(id))))

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(visible.map((r) => r.id)))

  const approve = async (ids: string[]) => {
    const many = ids.length > 1
    const { confirmed } = await confirm({
      title: many ? `Publish ${ids.length} jobs?` : 'Publish this job?',
      description: many
        ? 'They go live on the public board straight away. No one is emailed — synced jobs have no submitter.'
        : 'It goes live on the public board straight away. No one is emailed — synced jobs have no submitter.',
      confirmLabel: many ? `Publish ${ids.length}` : 'Approve and publish',
    })
    if (!confirmed) return
    run(ids, { action: 'approve' }, many ? 'published' : 'Job published to the live board')
  }

  /**
   * Every reject asks why, in the admin's words. During the filter trial
   * those comments are what the rules get tuned from, so the box is always
   * offered; it's only required for "Other", which says nothing on its own.
   */
  const reject = async (ids: string[], reason: string) => {
    const many = ids.length > 1
    const label = REJECT_REASONS.find((r) => r.value === reason)?.label ?? reason
    const required = reason === 'other'
    const { confirmed, note } = await confirm({
      title: many ? `Reject ${ids.length} jobs as “${label}”?` : `Reject as “${label}”?`,
      confirmLabel: many ? `Reject ${ids.length}` : 'Reject',
      destructive: true,
      note: {
        label: required ? 'Why? (required for Other)' : 'Why? (optional)',
        placeholder: 'e.g. Asks for 3 years agency experience in the second paragraph',
        helper: 'Helps tune the filter during the trial. Max 500 characters.',
      },
    })
    if (!confirmed) return
    if (required && !note) {
      toast.error('Add a short note for “Other” so the filter can learn from it')
      return
    }
    if (note.length > 500) {
      toast.error('Keep the note under 500 characters')
      return
    }
    run(ids, { action: 'reject', reason, comment: note || undefined }, many ? 'rejected' : 'Job rejected')
  }

  /**
   * Runs the current filter over the whole pending queue: lists what it would
   * remove first, and rejects only once the admin confirms that list.
   */
  const recheck = () => {
    startTransition(async () => {
      const preview = await fetch('/api/admin/staged/recheck', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apply: false }),
      })
      const found = await preview.json().catch(() => ({}))
      if (!preview.ok) {
        toast.error(found.error || 'Recheck failed')
        return
      }
      const removed: Array<{ title: string; company: string }> = found.removed ?? []
      if (removed.length === 0) {
        toast.success('Nothing in the queue is caught by the current filter')
        return
      }
      const listed = removed.slice(0, 8).map((r) => `${decodeHtmlEntities(r.title)} (${r.company})`).join(', ')
      const { confirmed } = await confirm({
        title: `Remove ${removed.length} job${removed.length === 1 ? '' : 's'} the filter now catches?`,
        description: `${listed}${removed.length > 8 ? `, and ${removed.length - 8} more` : ''}.`,
        warning: 'Each is rejected with the rule that caught it as its comment. Nothing is emailed.',
        confirmLabel: `Remove ${removed.length}`,
        destructive: true,
      })
      if (!confirmed) return

      const res = await fetch('/api/admin/staged/recheck', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apply: true }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(payload.error || 'Recheck failed')
        return
      }
      hide((payload.removed ?? []).map((r: { id: string }) => r.id))
      toast.success(`${(payload.removed ?? []).length} removed by the filter`)
      router.refresh()
    })
  }

  /**
   * One route for one row, the bulk route for several -- both claim per row.
   *
   * Rows leave the list the moment the admin confirms, not when the server
   * answers: waiting on the round trip plus the refresh made every reject feel
   * like a five-second hang. A failure puts the rows back.
   */
  const run = (ids: string[], body: { action: string; reason?: string; comment?: string }, successText: string) => {
    hide(ids)
    startTransition(async () => {
      if (ids.length === 1) {
        const res = await postJson(`/api/admin/staged/${ids[0]}/${body.action}`, {
          reason: body.reason,
          comment: body.comment,
        })
        const payload = await res.json().catch(() => ({}))
        if (!res.ok) {
          toast.error(payload.error || 'Action failed')
          // 409: someone else already actioned it, so it stays gone.
          if (res.status === 409) router.refresh()
          else unhide(ids)
          return
        }
        toast.success(successText)
      } else {
        const res = await postJson('/api/admin/staged/bulk', { ids, ...body })
        const payload = await res.json().catch(() => ({}))
        if (!res.ok) {
          toast.error(payload.error || 'Bulk action failed')
          unhide(ids)
          return
        }
        const failedRows: Array<{ id: string; reason: string }> = payload.failed ?? []
        // A conflict was actioned by someone else and stays gone; an error comes back.
        unhide(failedRows.filter((f) => f.reason !== 'conflict').map((f) => f.id))
        const failed = failedRows.length
        if (failed > 0) {
          toast.warning(`${payload.succeeded.length} ${successText}, ${failed} failed`, {
            description: 'The failed ones were already actioned or hit an error — the list has been refreshed.',
          })
        } else {
          toast.success(`${payload.succeeded.length} ${successText}`)
        }
      }
      router.refresh()
    })
  }

  const selectedIds = visible.filter((r) => selected.has(r.id)).map((r) => r.id)

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-800 font-heading">Synced jobs to review</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {remaining.length === 0
              ? 'Nothing waiting. Jobs synced from employer career sites and LinkedIn appear here when they need a human look.'
              : reviewOnly
                ? 'From employer career sites and LinkedIn. Sources are review-only for now, so every synced job waits here before it goes live.'
                : 'From employer career sites and LinkedIn, held because something about them needs a human look.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {sourceCounts.length > 1 && (
            <NativeSelect
              aria-label="Filter synced jobs by source"
              value={activeFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="h-8 rounded-lg pl-2.5 pr-7 text-xs"
            >
              <NativeSelectOption value="all">All sources ({remaining.length})</NativeSelectOption>
              {sourceCounts.map((s) => (
                <NativeSelectOption key={s.slug} value={s.slug}>
                  {s.name} ({s.count})
                </NativeSelectOption>
              ))}
            </NativeSelect>
          )}

          {selectedIds.length === 0 && visible.length > 0 && (
            <Button className={cn(softButtonClassName)} onClick={recheck}>
              <FunnelIcon className="size-4" />
              Recheck with filter
            </Button>
          )}

          {selectedIds.length > 0 && (
            <>
              <Button className={cn(softButtonClassName)} onClick={() => approve(selectedIds)}>
                <CheckIcon weight="bold" className="size-4" />
                Approve {selectedIds.length}
              </Button>
              <RejectMenu label={`Reject ${selectedIds.length} as…`} onReject={(reason) => reject(selectedIds, reason)}>
                <Button className={cn(softButtonClassName)}>
                  <XIcon weight="bold" className="size-4" />
                  Reject {selectedIds.length}
                  <CaretDownIcon className="size-3.5" />
                </Button>
              </RejectMenu>
            </>
          )}
        </div>
      </div>

      {visible.length > 0 && (
        <div role="table" aria-label="Synced jobs to review" className="hidden lg:block">
          <GridRow header columnsClassName={STAGED_GRID_COLUMNS}>
            <div className="flex items-center px-3">
              <SelectCheckbox
                label="Select all synced jobs"
                checked={allSelected}
                indeterminate={someSelected}
                onChange={toggleAll}
              />
            </div>
            <div className={cn('px-3', headerLabelClassName)}>Job</div>
            <div className={cn('px-3', headerLabelClassName)}>Source</div>
            <div className={cn('px-3 text-right', headerLabelClassName)}>Closes</div>
            <div className="px-3">
              <span className="sr-only">Actions</span>
            </div>
          </GridRow>

          <div className="pt-1">
            {visible.map((row) => {
              const job = row.normalised
              const title = decodeHtmlEntities(job.title)
              const secondary = [job.company, job.location].filter(Boolean).join(' · ')

              return (
                <GridRow
                  key={row.id}
                  columnsClassName={STAGED_GRID_COLUMNS}
                  className={cn(selected.has(row.id) && 'bg-primary/5 hover:bg-primary/[0.07]')}
                >
                  <div className="flex items-center px-3 py-3">
                    <SelectCheckbox label={`Select ${title}`} checked={selected.has(row.id)} onChange={() => toggle(row.id)} />
                  </div>

                  <div className="min-w-0 px-3 py-3">
                    <div className="flex items-center gap-1">
                      <PreviewLink id={row.id} title={title} className="truncate" />
                      <PostingLink url={job.url} title={title} />
                    </div>
                    {secondary && <p className="text-xs text-muted-foreground truncate">{secondary}</p>}
                    <RiskChips reasons={row.risk_reasons} />
                  </div>

                  <div className="min-w-0 px-3 py-3">
                    <p className="text-xs text-slate-700 truncate">{row.source?.name ?? 'Unknown source'}</p>
                    {row.source && <p className="text-[11px] text-muted-foreground">Tier {row.source.tier}</p>}
                  </div>

                  <div className="px-3 py-3 flex items-center justify-end text-xs tabular-nums whitespace-nowrap">
                    {job.closing_at ? (
                      <span className="text-muted-foreground">{formatDate(job.closing_at)}</span>
                    ) : (
                      <span className="text-muted-foreground/60">—</span>
                    )}
                  </div>

                  <div className="px-3 py-3">
                    <RowActions onApprove={() => approve([row.id])} onReject={(reason) => reject([row.id], reason)} />
                  </div>
                </GridRow>
              )
            })}
          </div>
        </div>
      )}

      {/* Below lg, the five fixed columns (368px) leave the job column no
          room -- cards instead, the same breakpoint SubmissionsTable uses. */}
      {visible.length > 0 && (
        <div className="lg:hidden space-y-2">
          {visible.map((row) => {
            const job = row.normalised
            const title = decodeHtmlEntities(job.title)
            return (
              <div
                key={row.id}
                className={cn('rounded-xl bg-slate-50 p-3', selected.has(row.id) && 'bg-primary/5')}
              >
                <div className="flex items-start gap-3">
                  <SelectCheckbox label={`Select ${title}`} checked={selected.has(row.id)} onChange={() => toggle(row.id)} className="mt-1" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <PreviewLink id={row.id} title={title} />
                      <PostingLink url={job.url} title={title} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {[job.company, job.location, row.source?.name].filter(Boolean).join(' · ')}
                      {job.closing_at && ` · Closes ${formatDate(job.closing_at)}`}
                    </p>
                    <RiskChips reasons={row.risk_reasons} />
                  </div>
                  <RowActions onApprove={() => approve([row.id])} onReject={(reason) => reject([row.id], reason)} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {dialog}
    </div>
  )
}
