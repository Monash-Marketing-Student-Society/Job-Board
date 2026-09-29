'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowSquareOutIcon, CheckIcon, XIcon, CaretDownIcon } from '@phosphor-icons/react'
import { Badge, Button, useConfirmDialog } from '@/components/ui'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/shadcn/dropdown-menu'
import { GridRow, IconActionButton, SelectCheckbox, softButtonClassName, headerLabelClassName } from './table'
import { cn, formatDate, decodeHtmlEntities, toApplicationHref } from '@/lib/utils'

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
 * becomes visible.
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

const RISK_LABELS: Record<string, string> = {
  tier_b_or_c: 'Aggregator source',
  missing_title: 'No title',
  missing_company: 'No company',
  no_direct_link: 'Not a direct link',
  missing_job_type: 'Job type unknown',
  missing_closing_date: 'No closing date',
  inferred_closing_date: 'Closing date guessed',
  inferred_location: 'Location guessed',
  inferred_job_type: 'Job type guessed',
  classifier_unsure: 'Unsure it fits',
  new_adapter: 'New source',
  review_only_mode: 'Review-only source',
}

const REJECT_REASONS: Array<{ value: string; label: string }> = [
  { value: 'irrelevant', label: 'Not relevant' },
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
      <DropdownMenuContent align="end" className="w-48">
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
          {RISK_LABELS[reason] ?? reason}
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

export function StagedJobsTable({ rows }: { rows: StagedJobRow[] }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const { confirm, dialog } = useConfirmDialog()

  const visible = rows.filter((r) => !hidden.has(r.id))
  const allSelected = visible.length > 0 && visible.every((r) => selected.has(r.id))
  const someSelected = !allSelected && visible.some((r) => selected.has(r.id))
  const reviewOnly = rows.some((r) => r.risk_reasons.includes('review_only_mode'))

  const hide = (ids: string[]) => {
    setHidden((prev) => new Set([...prev, ...ids]))
    setSelected((prev) => new Set([...prev].filter((id) => !ids.includes(id))))
  }

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

  const reject = (ids: string[], reason: string) => {
    run(ids, { action: 'reject', reason }, ids.length > 1 ? 'rejected' : 'Job rejected')
  }

  /** One route for one row, the bulk route for several -- both claim per row. */
  const run = (ids: string[], body: { action: string; reason?: string }, successText: string) => {
    startTransition(async () => {
      if (ids.length === 1) {
        const res = await fetch(`/api/admin/staged/${ids[0]}/${body.action}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: body.reason }),
        })
        const payload = await res.json().catch(() => ({}))
        if (!res.ok) {
          toast.error(payload.error || 'Action failed')
          if (res.status === 409) router.refresh()
          return
        }
        hide(ids)
        toast.success(successText)
      } else {
        const res = await fetch('/api/admin/staged/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids, ...body }),
        })
        const payload = await res.json().catch(() => ({}))
        if (!res.ok) {
          toast.error(payload.error || 'Bulk action failed')
          return
        }
        hide(payload.succeeded ?? [])
        const failed = (payload.failed ?? []).length
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
            {visible.length === 0
              ? 'Nothing waiting. Jobs synced from employer career sites appear here when they need a human look.'
              : reviewOnly
                ? 'From employer career sites. Sources are review-only for now, so every synced job waits here before it goes live.'
                : 'From employer career sites, held because something about them needs a human look.'}
          </p>
        </div>

        {selectedIds.length > 0 && (
          <div className="flex items-center gap-2">
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
          </div>
        )}
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
                      <p className="text-sm font-medium text-slate-800 truncate">{title}</p>
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
                      <p className="text-sm font-medium text-slate-800">{title}</p>
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
