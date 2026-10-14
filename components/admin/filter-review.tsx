'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowCounterClockwiseIcon, ArrowSquareOutIcon, MagnifyingGlassIcon } from '@phosphor-icons/react'
import { Badge, Button, Input, useConfirmDialog } from '@/components/ui'
import { segmentedTabsListClassName, segmentedTabsTriggerClassName } from '@/components/ui/segmented-tabs'
import { softButtonClassName } from './table'
import { TRACK_SHAPE } from './table/table-styles'
import { REJECT_REASONS } from './staged-jobs-table'
import { cn, decodeHtmlEntities, formatDate, formatRelativeTime, toApplicationHref } from '@/lib/utils'
import { targetRuleLabel, type TargetRule } from '@/lib/sync/target'
import {
  FILTERED_MAX_LIMIT,
  FILTERED_PAGE_SIZE,
  cleanSearch,
  filteredHref,
  type FilteredParams,
} from '@/lib/sync/filtered-query'

/**
 * The filter trial's two lists (Oct 2026):
 *
 * - Filtered out: postings the sync gate removed before review, with the rule
 *   and the text that fired it. A wrong removal is invisible anywhere else, so
 *   this is where one gets caught -- and Restore puts it in the review queue.
 *   Search, rule and page size live in the URL and are applied on the server
 *   (lib/sync/filtered-query.ts), so every filtered posting is reachable.
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

export interface RuleCount {
  rule: TargetRule
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

/** How long typing pauses before the search goes to the server. */
const SEARCH_DEBOUNCE_MS = 300

function FilteredList({
  rows,
  total,
  ruleCounts,
  params,
}: {
  rows: FilteredRow[]
  total: number
  ruleCounts: RuleCount[]
  params: FilteredParams
}) {
  const router = useRouter()
  const [navigating, startNavigation] = useTransition()
  const [, startTransition] = useTransition()
  const [search, setSearch] = useState(params.q)
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const { confirm, dialog } = useConfirmDialog()

  const go = (next: Partial<FilteredParams>) => {
    // A new search or rule starts again from the first page.
    const limit = next.limit ?? FILTERED_PAGE_SIZE
    startNavigation(() => router.replace(filteredHref({ ...params, ...next, limit }), { scroll: false }))
  }

  useEffect(() => {
    const q = cleanSearch(search)
    if (q === params.q) return
    const timer = setTimeout(() => go({ q }), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `go` is rebuilt each render; params.q is what matters
  }, [search, params.q])

  const visible = rows.filter((r) => !hidden.has(r.id))
  const allCount = ruleCounts.reduce((sum, r) => sum + r.count, 0)
  const remaining = total - rows.length
  const canShowMore = remaining > 0 && params.limit < FILTERED_MAX_LIMIT

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

  if (allCount === 0 && !params.q) {
    return <p className="py-6 text-sm text-slate-500">Nothing filtered yet. Postings appear here after the next nightly sync.</p>
  }

  return (
    <div>
      <div className="relative mb-3 w-full sm:w-72">
        {/* Decorative — the input itself is the whole hit target. */}
        <MagnifyingGlassIcon
          aria-hidden="true"
          weight="bold"
          className="pointer-events-none absolute left-3 top-1/2 z-10 size-3.5 -translate-y-1/2 text-slate-400"
        />
        <Input
          type="search"
          aria-label="Search filtered postings by title or company"
          placeholder="Search title or company"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={cn(
            TRACK_SHAPE,
            'border-0 bg-slate-100 pl-8 pr-3 text-sm placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-primary/25 focus-visible:ring-offset-0'
          )}
        />
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        <FilterChip active={params.rule === null} onClick={() => go({ rule: null })}>
          All {allCount}
        </FilterChip>
        {ruleCounts.map((r) => (
          <FilterChip key={r.rule} active={params.rule === r.rule} onClick={() => go({ rule: r.rule })}>
            {targetRuleLabel(r.rule)} {r.count}
          </FilterChip>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="py-6 text-sm text-slate-500">No filtered postings match.</p>
      ) : (
        <ul className={cn('divide-y divide-slate-100 transition-opacity', navigating && 'opacity-60')}>
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
      )}

      {remaining > 0 && (
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
          <p className="text-xs text-muted-foreground">
            Showing {rows.length} of {total}
            {!canShowMore && ' — search to find the rest'}
          </p>
          {canShowMore && (
            <Button
              className={softButtonClassName}
              disabled={navigating}
              onClick={() => go({ limit: params.limit + FILTERED_PAGE_SIZE })}
            >
              Show {Math.min(remaining, FILTERED_PAGE_SIZE)} more
            </Button>
          )}
        </div>
      )}
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
  filteredTotal,
  ruleCounts,
  params,
  feedback,
  reasonCounts,
  reasonWindowDays,
}: {
  filtered: FilteredRow[]
  filteredTotal: number
  ruleCounts: RuleCount[]
  params: FilteredParams
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
          Filtered out ({ruleCounts.reduce((sum, r) => sum + r.count, 0)})
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
        <FilteredList rows={filtered} total={filteredTotal} ruleCounts={ruleCounts} params={params} />
      ) : (
        <FeedbackList rows={feedback} reasonCounts={reasonCounts} windowDays={reasonWindowDays} />
      )}
    </div>
  )
}
