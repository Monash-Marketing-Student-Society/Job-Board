'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowCounterClockwiseIcon, ArrowSquareOutIcon } from '@phosphor-icons/react'
import { Badge, Button, useConfirmDialog } from '@/components/ui'
import { segmentedTabsListClassName, segmentedTabsTriggerClassName } from '@/components/ui/segmented-tabs'
import { softButtonClassName } from './table'
import { REJECT_REASONS } from './staged-jobs-table'
import { cn, decodeHtmlEntities, formatDate, formatRelativeTime, toApplicationHref } from '@/lib/utils'
import { targetRuleLabel } from '@/lib/sync/target'

/**
 * The filter trial's two lists (Oct 2026):
 *
 * - Filtered out: postings the sync gate removed before review, with the rule
 *   and the text that fired it. A wrong removal is invisible anywhere else, so
 *   this is where one gets caught -- and Restore puts it in the review queue.
 * - Feedback: synced jobs an admin rejected with a comment. What the rules
 *   get tuned from.
 */

export interface FilteredRow {
  id: string
  rule: string
  evidence: string | null
  seenCount: number
  firstSeenAt: string
  lastSeenAt: string
  title: string
  company: string
  location: string | null
  url: string
  source: string | null
}

export interface FeedbackRow {
  id: string
  reason: string
  comment: string
  rejectedAt: string
  title: string
  company: string
  url: string
  source: string | null
}

export interface ReasonCount {
  reason: string
  count: number
}

type Tab = 'filtered' | 'feedback'

function reasonLabel(reason: string): string {
  return REJECT_REASONS.find((r) => r.value === reason)?.label ?? reason
}

function PostingLink({ url, title }: { url: string; title: string }) {
  if (!url) return null
  return (
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

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-full border px-2.5 py-0.5 text-xs transition-colors',
        active ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-slate-200 text-slate-600 hover:border-slate-300'
      )}
    >
      {children}
    </button>
  )
}

function FilteredList({ rows }: { rows: FilteredRow[] }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [rule, setRule] = useState<string | null>(null)
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const { confirm, dialog } = useConfirmDialog()

  const live = rows.filter((r) => !hidden.has(r.id))
  const rules = [...new Set(live.map((r) => r.rule))]
  const visible = rule ? live.filter((r) => r.rule === rule) : live

  const restore = async (row: FilteredRow) => {
    const { confirmed } = await confirm({
      title: 'Restore to the review queue?',
      description: `“${decodeHtmlEntities(row.title)}” goes to Synced jobs to review, marked “Restored by admin”. It is not published until someone approves it.`,
      confirmLabel: 'Restore',
    })
    if (!confirmed) return

    startTransition(async () => {
      const res = await fetch(`/api/admin/filtered/${row.id}/restore`, { method: 'POST' })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(payload.error || 'Restore failed')
        if (res.status === 409) router.refresh()
        return
      }
      setHidden((prev) => new Set([...prev, row.id]))
      toast.success('Restored to the review queue', {
        description: 'Tell Claude why the filter was wrong so the rule can be fixed.',
      })
      router.refresh()
    })
  }

  if (live.length === 0) {
    return <p className="py-6 text-sm text-slate-500">Nothing filtered yet. Postings appear here after the next nightly sync.</p>
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        <FilterChip active={rule === null} onClick={() => setRule(null)}>
          All {live.length}
        </FilterChip>
        {rules.map((r) => (
          <FilterChip key={r} active={rule === r} onClick={() => setRule(r)}>
            {targetRuleLabel(r)} {live.filter((row) => row.rule === r).length}
          </FilterChip>
        ))}
      </div>

      <ul className="divide-y divide-slate-100">
        {visible.map((row) => {
          const title = decodeHtmlEntities(row.title)
          return (
            <li key={row.id} className="flex items-start gap-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  <p className="text-sm font-medium text-slate-800 truncate">{title}</p>
                  <PostingLink url={row.url} title={title} />
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {[row.company, row.location, row.source].filter(Boolean).join(' · ')}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <Badge variant="warning" className="rounded-full px-1.5 py-0 text-[10px] font-medium leading-4">
                    {targetRuleLabel(row.rule)}
                  </Badge>
                  {row.evidence && row.rule === 'experience_required' && (
                    <span className="text-xs text-slate-600">“{row.evidence}”</span>
                  )}
                  <span className="text-[11px] text-muted-foreground">
                    Seen {row.seenCount}× · last {formatRelativeTime(row.lastSeenAt)}
                  </span>
                </div>
              </div>
              <Button className={cn(softButtonClassName, 'shrink-0')} onClick={() => restore(row)}>
                <ArrowCounterClockwiseIcon className="size-4" />
                Restore
              </Button>
            </li>
          )
        })}
      </ul>
      {dialog}
    </div>
  )
}

function FeedbackList({ rows, reasonCounts, windowDays }: { rows: FeedbackRow[]; reasonCounts: ReasonCount[]; windowDays: number }) {
  return (
    <div>
      {reasonCounts.length > 0 && (
        <p className="mb-3 text-xs text-slate-500">
          <span className="font-medium text-slate-700">Rejected in the last {windowDays} days: </span>
          {reasonCounts.map((r) => `${reasonLabel(r.reason)} ${r.count}`).join(' · ')}
        </p>
      )}

      {rows.length === 0 ? (
        <p className="py-6 text-sm text-slate-500">No comments yet. Add a note when you reject a synced job and it shows here.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map((row) => {
            const title = decodeHtmlEntities(row.title)
            return (
              <li key={row.id} className="py-3">
                <div className="flex items-center gap-1">
                  <p className="text-sm font-medium text-slate-800 truncate">{title}</p>
                  <PostingLink url={row.url} title={title} />
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {[row.company, row.source, formatDate(row.rejectedAt)].filter(Boolean).join(' · ')}
                </p>
                <div className="mt-1.5 flex flex-wrap items-start gap-1.5">
                  <Badge variant="secondary" className="rounded-full px-1.5 py-0 text-[10px] font-medium leading-4">
                    {reasonLabel(row.reason)}
                  </Badge>
                  <p className="text-sm text-slate-700">{row.comment}</p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export function FilterReview({
  filtered,
  feedback,
  reasonCounts,
  reasonWindowDays,
}: {
  filtered: FilteredRow[]
  feedback: FeedbackRow[]
  reasonCounts: ReasonCount[]
  reasonWindowDays: number
}) {
  const [tab, setTab] = useState<Tab>('filtered')

  return (
    <div>
      <div role="tablist" aria-label="Filter lists" className={cn(segmentedTabsListClassName, 'mb-4')}>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'filtered'}
          className={segmentedTabsTriggerClassName(tab === 'filtered', 'normal-case')}
          onClick={() => setTab('filtered')}
        >
          Filtered out ({filtered.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'feedback'}
          className={segmentedTabsTriggerClassName(tab === 'feedback', 'normal-case')}
          onClick={() => setTab('feedback')}
        >
          Feedback ({feedback.length})
        </button>
      </div>

      {tab === 'filtered' ? (
        <FilteredList rows={filtered} />
      ) : (
        <FeedbackList rows={feedback} reasonCounts={reasonCounts} windowDays={reasonWindowDays} />
      )}
    </div>
  )
}
