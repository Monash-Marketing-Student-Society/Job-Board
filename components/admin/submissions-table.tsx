'use client'

import { useOptimistic, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowSquareOutIcon, CheckIcon, XIcon, DotsThreeVerticalIcon, ArchiveIcon } from '@phosphor-icons/react'
import { Badge, Button, useConfirmDialog } from '@/components/ui'
import { segmentedTabsListClassName, segmentedTabsTriggerClassName } from '@/components/ui/segmented-tabs'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/shadcn/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/shadcn/popover'
import {
  GridRow,
  StatusDot,
  IconActionButton,
  AdminPagination,
  SelectCheckbox,
  TRACK_SHAPE,
  softButtonClassName,
  headerLabelClassName,
  type StatusDotRole,
} from './table'
import { cn, formatDate, decodeHtmlEntities, toApplicationHref } from '@/lib/utils'
import type { JobSubmission } from '@/lib/types'

/** Literal so Tailwind's JIT scanner can see it — a class built from a
 *  runtime string never gets generated. Shared by the header and every
 *  body row via GridRow so the two can never drift out of alignment.
 *
 *  checkbox / submission / closes / status / actions — the same 40px checkbox
 *  track as the Jobs table. Actions is 128px: pending rows hold three 32px
 *  chip-sized icon buttons (Approve, Reject, ⋯) with two 4px gaps — 104px —
 *  plus px-3 either side. */
const SUBMISSION_GRID_COLUMNS = 'grid-cols-[40px_minmax(0,1fr)_112px_112px_128px]'

/** Info chips on the mobile cards: white on the card's slate-50 fill. */
const MOBILE_CHIP = 'rounded-full border-0 bg-white text-[11px] font-normal text-slate-600'

const STATUS_VARIANTS: Record<string, 'warning' | 'success' | 'destructive'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'destructive',
}

/**
 * Status role for the grid's StatusDot (STATUS_VARIANTS above still feeds
 * the mobile card's Badge, untouched by this pass). All three statuses need
 * to read as distinct at a glance, so all three map to an actual hue —
 * `muted` is deliberately unused here: that's the jobs page's Inactive
 * state, not a moderation decision.
 *
 * Pending uses `success`/`warning`/`destructive`'s `warning` role, backed by
 * the `--warning` token (app/globals.css), not `--accent`: `--accent` is
 * chroma 0 in both light and dark — literally grayscale, not a
 * shade-picking problem — so it can't carry a "needs attention" signal
 * regardless of which shade is used. `--warning` is a real amber hue.
 * Badge/Alert's `warning` variant still maps to `--accent` elsewhere in the
 * app — worth migrating too, but wider than this task.
 */
const STATUS_ROLE: Record<JobSubmission['status'], StatusDotRole> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'destructive',
}

/**
 * The submitter's contact details, opened from their initials avatar in the
 * row. These came in through the public /submit form and are the only way to
 * reach whoever posted the job, so they get a click target of their own
 * rather than living solely in the overflow menu.
 */
function SubmitterPopover({ submission }: { submission: JobSubmission }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Contact details for ${submission.submitter_name}`}
          className="size-[30px] shrink-0 select-none rounded-full bg-slate-100 text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-0"
        >
          {getInitials(submission.submitter_name)}
        </button>
      </PopoverTrigger>
      {/* w-72: PopoverContent defaults to the trigger's width, which is a
          30px avatar. p-3 overrides the 4px row gutter it uses for menus. */}
      <PopoverContent align="start" className="w-72 p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Submitted by</p>
        <p className="mt-1.5 text-sm font-medium text-slate-800">{submission.submitter_name}</p>
        <a
          href={`mailto:${submission.submitter_email}`}
          className="block break-all text-xs text-primary hover:underline"
        >
          {submission.submitter_email}
        </a>
        <p className="mt-0.5 text-xs text-slate-500">{submission.submitter_company_name}</p>
        <p className="mt-2 border-t border-slate-100 pt-2 text-xs text-slate-400">
          Submitted {formatDate(submission.created_at)}
        </p>
      </PopoverContent>
    </Popover>
  )
}

/** First letter of the first and last name; a single name just takes its first two letters. */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/** Local-date comparison: a closing date of "today" isn't past yet. */
function isPastDate(isoDate: string): boolean {
  const closing = new Date(isoDate)
  closing.setHours(23, 59, 59, 999)
  return closing.getTime() < Date.now()
}

interface SubmissionsTableProps {
  submissions: JobSubmission[]
  totalCount: number
  currentPage: number
  totalPages: number
  /** Viewing the archive rather than the live queue. */
  showArchived?: boolean
  /**
   * True per-status totals for the filter tabs (not just this page).
   * Undefined — not zeros — means the count query failed or was skipped;
   * the tabs render without numbers rather than showing zeros that would
   * read as "nothing here."
   */
  counts?: { all: number; pending: number; approved: number; rejected: number }
}

export function SubmissionsTable({
  submissions,
  totalCount,
  currentPage,
  totalPages,
  showArchived = false,
  counts,
}: SubmissionsTableProps) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all')
  const { confirm, dialog } = useConfirmDialog()

  // Status flips to approved/rejected immediately; React drops the optimistic
  // layer if the request fails, restoring the pending row.
  const [optimisticSubmissions, applyOptimistic] = useOptimistic(
    submissions,
    (
      rows: JobSubmission[],
      update:
        | { type: 'status'; id: string; status: JobSubmission['status'] }
        | { type: 'remove'; id: string }
    ) =>
      update.type === 'remove'
        ? rows.filter((row) => row.id !== update.id)
        : rows.map((row) =>
            row.id === update.id ? { ...row, status: update.status } : row
          )
  )

  // Pending first (the thing waiting on a decision), then newest-submitted
  // first within each group. The server orders by created_at alone across
  // the whole table; this re-sorts within the fetched/filtered page only,
  // the same client-side scope the status filter above already works in —
  // it doesn't pull pending rows forward from a later page.
  const filtered = (
    filter === 'all' ? optimisticSubmissions : optimisticSubmissions.filter((s) => s.status === filter)
  )
    .slice()
    .sort((a, b) => {
      if (a.status === 'pending' && b.status !== 'pending') return -1
      if (a.status !== 'pending' && b.status === 'pending') return 1
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })

  const handleApprove = async (id: string) => {
    const { confirmed } = await confirm({
      title: 'Publish this listing?',
      description:
        'The job goes live on the public board straight away, and the submitter is emailed to let them know.',
      confirmLabel: 'Approve and publish',
    })
    if (!confirmed) return

    startTransition(async () => {
      applyOptimistic({ type: 'status', id, status: 'approved' })

      const res = await fetch(`/api/admin/submissions/${id}/approve`, { method: 'POST' })
      const body = await res.json().catch(() => ({}))

      if (!res.ok) {
        toast.error(body.error || 'Failed to approve submission')
        return
      }

      // The job is published either way — but if the submitter was never
      // emailed, the admin needs to know so they can follow up.
      if (body.email_sent === false) {
        toast.warning('Job published, but the approval email failed to send', {
          description: body.email_error,
          duration: 10000,
        })
      } else {
        toast.success('Job published to the live board')
      }

      router.refresh()
    })
  }

  const handleReject = async (id: string) => {
    // One muted line under the textarea carries everything the description,
    // the amber warning, and the old helper text used to say separately —
    // the note is rendered as a "Reviewer note" block in the rejection email
    // (lib/email-templates.ts), so "sent in the email" already covers the
    // old warning's point about not recording internal notes here.
    const { confirmed, note } = await confirm({
      title: 'Reject this submission?',
      confirmLabel: 'Reject',
      destructive: true,
      note: {
        label: 'Reason for rejection (optional)',
        placeholder: 'This role is not relevant to marketing students',
        helper: 'Sent to the submitter in the rejection email. Leave blank for the standard message.',
      },
    })
    if (!confirmed) return

    startTransition(async () => {
      applyOptimistic({ type: 'status', id, status: 'rejected' })

      const res = await fetch(`/api/admin/submissions/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_note: note || null }),
      })
      const body = await res.json().catch(() => ({}))

      if (!res.ok) {
        toast.error(body.error || 'Failed to reject submission')
        return
      }

      if (body.email_sent === false) {
        toast.warning('Submission rejected, but the notification email failed to send', {
          description: body.email_error,
          duration: 10000,
        })
      } else {
        toast.success('Submission rejected')
      }

      router.refresh()
    })
  }

  const handleArchive = async (id: string) => {
    if (!showArchived) {
      const { confirmed } = await confirm({
        title: 'Archive this submission?',
        description:
          'It leaves the queue but is kept in full — you can restore it from the archive at any time. The submitter is not notified.',
        confirmLabel: 'Archive',
      })
      if (!confirmed) return
    }

    startTransition(async () => {
      // Either way the row leaves the view it is currently in.
      applyOptimistic({ type: 'remove', id })

      const res = await fetch(`/api/admin/submissions/${id}/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: !showArchived }),
      })
      const body = await res.json().catch(() => ({}))

      if (!res.ok) {
        toast.error(
          body.error || (showArchived ? 'Failed to restore submission' : 'Failed to archive submission')
        )
        return
      }

      toast.success(showArchived ? 'Submission restored to the queue' : 'Submission archived')
      router.refresh()
    })
  }

  // Selection — same model as job-table.tsx: judged against the rows on
  // screen (this page, after the status tab), so a bulk action can never
  // reach a submission the admin can't currently see.
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const visibleSelected = filtered.filter((s) => selected.has(s.id))
  const allVisibleSelected = filtered.length > 0 && visibleSelected.length === filtered.length
  const someVisibleSelected = visibleSelected.length > 0 && !allVisibleSelected

  const handleToggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSelectAll = () => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allVisibleSelected) filtered.forEach((s) => next.delete(s.id))
      else filtered.forEach((s) => next.add(s.id))
      return next
    })
  }

  /**
   * Archive (or, in the archive view, restore) every selected submission.
   *
   * Archive is the only bulk action on purpose. It's internal housekeeping —
   * reversible, and the archive route sends no email. Approve and Reject each
   * publish or email per row, so they stay one submission at a time.
   *
   * One request per row through the existing single-row route rather than a
   * new bulk endpoint; failures are counted and reported rather than aborting
   * the rest, and the optimistic removals for failed rows are dropped when
   * the transition settles.
   */
  const handleBulkArchive = async () => {
    const ids = visibleSelected.map((s) => s.id)
    if (ids.length === 0) return
    const noun = ids.length === 1 ? 'submission' : 'submissions'

    if (!showArchived) {
      const { confirmed } = await confirm({
        title: `Archive ${ids.length} ${noun}?`,
        description:
          'They leave the queue but are kept in full — you can restore them from the archive at any time. Submitters are not notified.',
        confirmLabel: 'Archive',
      })
      if (!confirmed) return
    }

    startTransition(async () => {
      ids.forEach((id) => applyOptimistic({ type: 'remove', id }))

      const results = await Promise.all(
        ids.map((id) =>
          fetch(`/api/admin/submissions/${id}/archive`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ archived: !showArchived }),
          })
            .then((res) => res.ok)
            .catch(() => false)
        )
      )
      const failed = results.filter((ok) => !ok).length
      const done = ids.length - failed

      setSelected(new Set())
      if (failed > 0) {
        toast.error(
          `${failed} of ${ids.length} ${noun} failed to ${showArchived ? 'restore' : 'archive'}`,
          done > 0 ? { description: `${done} ${showArchived ? 'restored' : 'archived'} successfully.` } : undefined
        )
      } else {
        toast.success(showArchived ? `${done} ${noun} restored to the queue` : `${done} ${noun} archived`)
      }
      router.refresh()
    })
  }

  return (
    <>
      {/* Toolbar — no divider line; tabs and the archive toggle share one row.
          Chips scroll as one row rather than wrapping to a second line;
          "View archive" stays put outside the scroll area so it's always
          reachable at the right. It's a soft track-sized button now, in the
          tabs' fill (components/admin/table/table-styles.ts), matching the
          Jobs table's toolbar actions. */}
      <div className="flex items-center gap-2 px-1 pb-4">
        <div className={`${segmentedTabsListClassName} overflow-x-auto min-w-0`}>
          {(['all', 'pending', 'approved', 'rejected'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={segmentedTabsTriggerClassName(filter === f, 'inline-flex items-center gap-1.5 font-heading')}
            >
              {f}
              {counts && (
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-medium normal-case rounded-full bg-slate-200/70 text-slate-500 leading-none tabular-nums">
                  {counts[f] > 99 ? '99+' : counts[f]}
                </span>
              )}
            </button>
          ))}
        </div>

        <Link
          href={showArchived ? '/admin/submissions' : '/admin/submissions?view=archived'}
          className={cn(
            softButtonClassName,
            'ml-auto inline-flex shrink-0 items-center whitespace-nowrap text-sm font-medium transition-colors'
          )}
        >
          <ArchiveIcon weight={showArchived ? 'fill' : 'bold'} className="size-3.5" />
          {showArchived ? 'Back to queue' : 'View archive'}
        </Link>
      </div>

      {/* Grid — lg and up only. A fixed 5-column template (checkbox /
          submission / closes / status / actions) needs real width to
          breathe; below lg it's replaced by the card list rather than
          squeezed.

          Every cell is px-3, header included, so header and rows align by
          construction. The header is GridRow's rounded shelf and rows
          separate on a hover fill — no divider lines — which is why the
          card around this is padded rather than edge to edge. */}
      <div className="hidden lg:block">
        <GridRow header columnsClassName={SUBMISSION_GRID_COLUMNS}>
          <div className="flex items-center px-3">
            <SelectCheckbox
              label="Select all submissions shown"
              checked={allVisibleSelected}
              indeterminate={someVisibleSelected}
              onChange={handleSelectAll}
            />
          </div>
          <div className={cn('px-3', headerLabelClassName)}>Submission</div>
          <div className={cn('px-3 text-right', headerLabelClassName)}>Closes</div>
          <div className={cn('px-3', headerLabelClassName)}>Status</div>
          {/* Icon buttons make the column self-evident; screen readers only. */}
          <div className="px-3"><span className="sr-only">Actions</span></div>
        </GridRow>

        <div className="pt-1">
          {filtered.map((submission) => {
            // company/location: skip null segments instead of rendering a
            // dangling " · " when one side is missing.
            const secondaryLine = [submission.company, submission.location].filter(Boolean).join(' · ')

            // Submitter email/company and job type/work mode have no row spot
            // as of Phase 2, and stay that way — no tooltip bridge. They're
            // still reachable from the detail view / edit-token flow elsewhere
            // in the app, and none of them are what a moderator scans a queue
            // for, per the redesign's premise. Phase 4's overflow menu is
            // where they'll actually resurface, once that menu exists.
            const closed = submission.closing_at ? isPastDate(submission.closing_at) : false

            return (
              <GridRow
                key={submission.id}
                columnsClassName={SUBMISSION_GRID_COLUMNS}
                className={cn(selected.has(submission.id) && 'bg-primary/5 hover:bg-primary/[0.07]')}
              >
                <div className="flex items-center px-3 py-3">
                  <SelectCheckbox
                    label={`Select ${decodeHtmlEntities(submission.title)}`}
                    checked={selected.has(submission.id)}
                    onChange={() => handleToggleSelect(submission.id)}
                  />
                </div>
                {/* Submission — 30px initials avatar + a two-line text block
                    (job title with an inline external-link icon, then
                    company · location). ~56px tall in the common case; a
                    rejection note (rare, only on rejected rows) adds a third
                    truncated line rather than being dropped silently. */}
                <div className="min-w-0 px-3 py-3 flex items-center gap-2.5">
                  <SubmitterPopover submission={submission} />

                  <div className="min-w-0">
                    <div className="flex items-center gap-1">
                      <p className="text-sm font-medium text-slate-800 truncate">{decodeHtmlEntities(submission.title)}</p>
                      {/* Opens the draft preview — how this listing will look
                          on the board — rather than the employer's own link,
                          which stays in the overflow menu and on the preview
                          page itself. */}
                      <Link
                        href={`/admin/submissions/${submission.id}/preview`}
                        aria-label={`Preview ${decodeHtmlEntities(submission.title)} as it will appear on the board`}
                        title="Preview draft listing"
                        className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
                      >
                        <ArrowSquareOutIcon className="size-3.5" />
                      </Link>
                      {submission.is_sponsored && (
                        <Badge className="shrink-0 rounded-full px-1.5 py-0 text-[10px] font-medium leading-4">
                          Sponsor requested
                        </Badge>
                      )}
                    </div>
                    {secondaryLine && (
                      <p className="text-xs text-muted-foreground truncate">{secondaryLine}</p>
                    )}
                    {submission.admin_note && (
                      // Muted, not destructive-red: the one field a moderator
                      // needs at a glance, but not an alarm. Truncated to one
                      // line — full text moves to the Phase 4 overflow menu,
                      // not a title tooltip.
                      <p className="text-xs text-muted-foreground truncate">
                        Sent to submitter: {submission.admin_note}
                      </p>
                    )}
                  </div>
                </div>

                {/* Closes — right-aligned so it doesn't run up against Status.
                    `whitespace-nowrap` + a 112px (not 84px) column: dates like
                    "31 Dec 2026" or "5 Sept 2026" were wrapping onto a second
                    line in the narrower column, which is what was throwing off
                    row height/alignment down the page — every other cell is
                    one line, so a wrapped date was the only row that grew.
                    Null and past-due both mute further than an open date,
                    since neither needs an admin's attention right now —
                    reduced opacity on muted-foreground rather than a separate
                    slate shade, since there's no dedicated "extra-muted" token. */}
                <div className="px-3 py-3 flex items-center justify-end text-xs tabular-nums whitespace-nowrap">
                  {submission.closing_at ? (
                    <span className={closed ? 'text-muted-foreground/60' : 'text-muted-foreground'}>
                      {formatDate(submission.closing_at)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground/60">—</span>
                  )}
                </div>

                {/* Status — fixed width on every row including pending, so the
                    dot lands at the same x-position all the way down. */}
                <div className="px-3 py-3 flex items-center gap-1.5">
                  <StatusDot role={STATUS_ROLE[submission.status]} label={submission.status} />
                </div>

                {/* Actions — fixed 128px width regardless of which/how many
                    actions this row has, so it never absorbs space at the
                    status column's expense (see SUBMISSION_GRID_COLUMNS).

                    justify-end here, not just inside SubmissionActionsMenu:
                    that inner div's own justify-end only centers/aligns
                    within ITS OWN box, and a flex item with no flex-grow
                    sizes to its content by default — without justify-end on
                    THIS wrapper too, a 1-button row (32px) and a 3-button row
                    (104px) both sat flush at the track's LEFT edge instead of
                    its right, so the ellipsis landed at a different x on
                    every row depending on how many buttons preceded it.
                    Caught by measuring actual DOM rects, not by eyeballing a
                    screenshot — the two looked visually "close enough". */}
                <div className="px-3 py-3 flex items-center justify-end">
                  <SubmissionActionsMenu
                    submission={submission}
                    showArchived={showArchived}
                    onApprove={handleApprove}
                    onReject={handleReject}
                    onArchive={handleArchive}
                  />
                </div>
              </GridRow>
            )
          })}
        </div>
      </div>

      {/* Cards — below lg. Same fields as the grid, same card pattern as the
          admin job list (soft slate-50 fill, 8px gaps, no borders), so a
          submitter's name/email, org, job, and the location/type/closing
          chips read as one record instead of a squeezed row. */}
      <div className="lg:hidden space-y-2">
        {filtered.length > 0 && (
          <label className={cn(TRACK_SHAPE, 'flex items-center gap-2.5 bg-slate-100/70 px-3')}>
            <SelectCheckbox
              label="Select all submissions shown"
              checked={allVisibleSelected}
              indeterminate={someVisibleSelected}
              onChange={handleSelectAll}
            />
            <span className={headerLabelClassName}>Select all</span>
          </label>
        )}
        {filtered.map((submission) => (
          <div
            key={submission.id}
            className={cn('rounded-xl p-3 space-y-2', selected.has(submission.id) ? 'bg-primary/5' : 'bg-slate-50')}
          >
            {/* Checkbox + submitter + status */}
            <div className="flex items-start justify-between gap-2">
              <SelectCheckbox
                label={`Select ${decodeHtmlEntities(submission.title)}`}
                checked={selected.has(submission.id)}
                onChange={() => handleToggleSelect(submission.id)}
                className="mt-1 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-800 leading-tight">{submission.submitter_name}</p>
                <a href={`mailto:${submission.submitter_email}`} className="text-xs text-primary hover:underline break-all">
                  {submission.submitter_email}
                </a>
                <p className="text-xs text-slate-400 mt-0.5">{submission.submitter_company_name}</p>
              </div>
              <Badge variant={STATUS_VARIANTS[submission.status] || 'secondary'} className="rounded-full capitalize shrink-0">
                {submission.status}
              </Badge>
            </div>

            {/* Job title + company */}
            <div>
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-medium text-slate-700 leading-tight">{decodeHtmlEntities(submission.title)}</p>
                {submission.is_sponsored && (
                  <Badge className="shrink-0 rounded-full px-1.5 py-0 text-[10px] font-medium leading-4">
                    Sponsor requested
                  </Badge>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">{submission.company}</p>
            </div>

            {/* Location/type/mode/closing as small chips — white on the
                card's slate-50 fill rather than outlined. */}
            {(submission.location || submission.job_type || submission.work_mode || submission.closing_at) && (
              <div className="flex flex-wrap gap-1">
                {submission.location && (
                  <Badge variant="outline" className={MOBILE_CHIP}>{submission.location}</Badge>
                )}
                {submission.job_type && (
                  <Badge variant="outline" className={cn(MOBILE_CHIP, 'capitalize')}>{submission.job_type}</Badge>
                )}
                {submission.work_mode && (
                  <Badge variant="outline" className={cn(MOBILE_CHIP, 'capitalize')}>{submission.work_mode}</Badge>
                )}
                {submission.closing_at && (
                  <Badge variant="outline" className={MOBILE_CHIP}>Closes {formatDate(submission.closing_at)}</Badge>
                )}
              </div>
            )}

            {submission.admin_note && (
              <p className="text-xs text-destructive">Sent to submitter: {submission.admin_note}</p>
            )}

            {/* Preview link + submitted date. The employer's own link is in
                the overflow menu, same as the desktop row. */}
            <div className="flex items-center justify-between">
              <Link
                href={`/admin/submissions/${submission.id}/preview`}
                className="text-xs text-primary hover:underline"
              >
                Preview draft →
              </Link>
              <span className="text-xs text-slate-400">{formatDate(submission.created_at)}</span>
            </div>

            {/* Actions, right-aligned in its own row */}
            <div className="flex items-center justify-end pt-1">
              <SubmissionActionsMenu
                submission={submission}
                showArchived={showArchived}
                onApprove={handleApprove}
                onReject={handleReject}
                onArchive={handleArchive}
              />
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-slate-400 text-sm">
          {showArchived
            ? 'Nothing archived'
            : filter !== 'all'
              ? `No ${filter} submissions`
              : 'No job submissions yet'}
        </div>
      )}

      {/* Footer — no divider line, pagination in the tabs' style. Doubles as
          the selection bar, same as the Jobs table. */}
      <div className="flex min-h-10 flex-wrap items-center justify-between gap-3 px-1 pt-4">
        {visibleSelected.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs text-slate-600">
              <span className="font-semibold tabular-nums text-slate-900">{visibleSelected.length}</span> of{' '}
              <span className="tabular-nums">{filtered.length}</span> selected
            </p>
            <Button type="button" variant="ghost" size="sm" className={softButtonClassName} onClick={handleBulkArchive}>
              <ArchiveIcon weight="bold" className="size-3.5" />
              {showArchived ? 'Restore selected' : 'Archive selected'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={cn(TRACK_SHAPE, 'px-3 text-slate-500 hover:bg-slate-100 hover:text-slate-900')}
              onClick={() => setSelected(new Set())}
            >
              Clear
            </Button>
          </div>
        ) : (
          <p className="text-xs text-slate-400">
            Showing <span className="tabular-nums text-slate-600">{filtered.length}</span> of{' '}
            <span className="tabular-nums text-slate-600">{totalCount}</span> submissions
          </p>
        )}
        {/* `view` rides along on every page link: without it, paging through
            the archive dropped back into the live queue on page 2. */}
        <AdminPagination
          currentPage={currentPage}
          totalPages={totalPages}
          baseUrl="/admin/submissions"
          searchParams={{ view: showArchived ? 'archived' : undefined }}
        />
      </div>

      {dialog}
    </>
  )
}

/**
 * Pending: two 28px icon buttons (Approve/Reject) + the overflow ellipsis.
 * Non-pending: the ellipsis alone, still right-aligned in the same column —
 * a lone icon button, not a lone icon button plus two icon-sized gaps where
 * Approve/Reject would have been.
 *
 * The ellipsis is where everything Phase 2/3 took off the row lands:
 * Archive/Restore, submitter email/company, job type/work mode, the
 * submitted date, and — when present — the full rejection note (the row
 * only ever shows a truncated line of it).
 */
function SubmissionActionsMenu({
  submission,
  showArchived,
  onApprove,
  onReject,
  onArchive,
}: {
  submission: JobSubmission
  showArchived: boolean
  onApprove: (id: string) => void
  onReject: (id: string) => void
  onArchive: (id: string) => void
}) {
  const showPendingActions = submission.status === 'pending' && !showArchived
  const jobMeta = [submission.job_type, submission.work_mode].filter(Boolean).join(' · ')

  return (
    <div className="flex items-center justify-end gap-1">
      {showPendingActions && (
        <>
          <IconActionButton
            label="Approve"
            className="text-success hover:text-success hover:bg-success/10"
            onClick={() => onApprove(submission.id)}
          >
            <CheckIcon weight="bold" className="size-4" />
          </IconActionButton>
          <IconActionButton
            label="Reject"
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => onReject(submission.id)}
          >
            <XIcon weight="bold" className="size-4" />
          </IconActionButton>
        </>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconActionButton label="More options" tooltip={false} className="text-muted-foreground">
            <DotsThreeVerticalIcon weight="bold" className="size-4" />
          </IconActionButton>
        </DropdownMenuTrigger>
        {/* No `dark` class (reverted) — see job-table.tsx's JobActionsMenu
            comment; back to the light --popover/--popover-foreground every
            other surface in this app uses. */}
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuItem asChild>
            <Link href={`/admin/submissions/${submission.id}/preview`}>Preview draft listing</Link>
          </DropdownMenuItem>
          {/* The employer's own application link. It used to be the row's
              external-link icon; that now opens the draft preview, so this is
              where the original lives. */}
          <DropdownMenuItem asChild>
            <a href={toApplicationHref(submission.url)} target="_blank" rel="noopener noreferrer">
              Open original listing
            </a>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => onArchive(submission.id)}>
            {showArchived ? 'Restore' : 'Archive'}
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          <DropdownMenuLabel>Submitted by</DropdownMenuLabel>
          <div className="px-3 pb-2 -mt-1 space-y-0.5">
            <p className="text-sm font-medium text-popover-foreground">{submission.submitter_name}</p>
            <p className="text-xs text-muted-foreground truncate">{submission.submitter_email}</p>
            <p className="text-xs text-muted-foreground truncate">{submission.submitter_company_name}</p>
          </div>

          <div className="px-3 pb-2 text-xs text-muted-foreground">
            {jobMeta && <span className="capitalize">{jobMeta} · </span>}
            Submitted {formatDate(submission.created_at)}
          </div>

          {submission.is_sponsored && (
            <p className="px-3 pb-2 -mt-1 text-xs text-primary">
              Submitter requested a sponsored placement. Approval publishes it unsponsored — set that on the live job.
            </p>
          )}

          {submission.admin_note && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Sent to submitter</DropdownMenuLabel>
              <p className="px-3 pb-2 -mt-1 text-xs text-muted-foreground">{submission.admin_note}</p>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
