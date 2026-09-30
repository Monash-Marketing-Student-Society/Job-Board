'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowSquareOutIcon, EyeSlashIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui'
import { GridRow, headerLabelClassName } from './table'
import { StatusDot } from './table/status-dot'
import { createClient } from '@/lib/supabase/client'
import { cn, decodeHtmlEntities, formatDate, toApplicationHref } from '@/lib/utils'

/**
 * Everything the sync published without review in the last seven days, with
 * one-click unpublish -- the oversight the PRD pairs with auto-publish.
 *
 * One click on purpose, no confirm: taking a job down is the safe direction,
 * and the toast's Undo puts it straight back (the same client-side
 * reactivate /admin/jobs uses, under the admin RLS update policy). Rows that
 * are already inactive stay listed so the week reads completely.
 */

export interface AutoPublishedRow {
  id: string
  title: string
  company: string
  location: string | null
  url: string
  closingAt: string | null
  isActive: boolean
  publishedAt: string
  sourceName: string
}

/** Literal for Tailwind's JIT scanner: job / source / published / closes / state+action. */
const GRID_COLUMNS = 'grid-cols-[minmax(0,1fr)_140px_132px_104px_156px]'

const publishedFormat = new Intl.DateTimeFormat('en-AU', {
  timeZone: 'Australia/Melbourne',
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
})

function PostingLink({ url, title }: { url: string; title: string }) {
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

function StateAndAction({ row, busy, onUnpublish }: { row: AutoPublishedRow; busy: boolean; onUnpublish: () => void }) {
  if (!row.isActive) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <StatusDot role="muted" label="Inactive" />
      </span>
    )
  }
  return (
    <Button
      type="button"
      variant="ghost"
      disabled={busy}
      onClick={onUnpublish}
      className="h-8 gap-1.5 rounded-lg bg-slate-100 px-3 text-xs text-slate-700 hover:bg-destructive/10 hover:text-destructive"
    >
      <EyeSlashIcon className="size-3.5" />
      Unpublish
    </Button>
  )
}

export function AutoPublishedTable({ rows, windowDays }: { rows: AutoPublishedRow[]; windowDays: number }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  // Optimistic: a row flips to Inactive the moment the route answers,
  // before the refresh lands.
  const [offIds, setOffIds] = useState<Set<string>>(new Set())

  const view = rows.map((r) => (offIds.has(r.id) ? { ...r, isActive: false } : r))
  const live = view.filter((r) => r.isActive).length

  const undo = (row: AutoPublishedRow) => {
    startTransition(async () => {
      const { error } = await createClient().from('jobs').update({ is_active: true }).eq('id', row.id)
      if (error) {
        toast.error('Could not put it back', { description: error.message })
        return
      }
      setOffIds((prev) => {
        const next = new Set(prev)
        next.delete(row.id)
        return next
      })
      toast.success('Back on the board')
      router.refresh()
    })
  }

  const unpublish = (row: AutoPublishedRow) => {
    setBusyId(row.id)
    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin/jobs/${row.id}/unpublish`, { method: 'POST' })
        const payload = await res.json().catch(() => ({}))
        if (!res.ok) {
          toast.error(payload.error || 'Could not unpublish')
          if (res.status === 409) router.refresh()
          return
        }
        setOffIds((prev) => new Set([...prev, row.id]))
        toast.success(`Unpublished: ${decodeHtmlEntities(row.title)}`, {
          description: 'The next sync run leaves it off.',
          action: { label: 'Undo', onClick: () => undo(row) },
        })
        router.refresh()
      } finally {
        setBusyId(null)
      }
    })
  }

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-base font-semibold text-slate-800 font-heading">Auto-published this week</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          {rows.length === 0
            ? `Nothing published without review in the last ${windowDays} days. Sources are review-only until their switch is on.`
            : `${rows.length} published without review in the last ${windowDays} days, ${live} still live. Unpublish anything that should not be there.`}
        </p>
      </div>

      {rows.length > 0 && (
        <div role="table" aria-label="Auto-published jobs" className="hidden lg:block">
          <GridRow header columnsClassName={GRID_COLUMNS}>
            <div className={cn('px-3', headerLabelClassName)}>Job</div>
            <div className={cn('px-3', headerLabelClassName)}>Source</div>
            <div className={cn('px-3', headerLabelClassName)}>Published</div>
            <div className={cn('px-3 text-right', headerLabelClassName)}>Closes</div>
            <div className="px-3">
              <span className="sr-only">Unpublish</span>
            </div>
          </GridRow>
          <div className="pt-1">
            {view.map((row) => {
              const title = decodeHtmlEntities(row.title)
              return (
                <GridRow key={row.id} columnsClassName={GRID_COLUMNS} className={cn(!row.isActive && 'text-slate-400')}>
                  <div className="min-w-0 px-3 py-3">
                    <div className="flex items-center gap-1">
                      <p className={cn('text-sm font-medium truncate', row.isActive && 'text-slate-800')}>{title}</p>
                      <PostingLink url={row.url} title={title} />
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {[row.company, row.location].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <div className="min-w-0 px-3 py-3 text-xs truncate">{row.sourceName}</div>
                  <div className="px-3 py-3 text-xs text-muted-foreground tabular-nums">
                    {publishedFormat.format(new Date(row.publishedAt))}
                  </div>
                  <div className="px-3 py-3 text-right text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                    {row.closingAt ? formatDate(row.closingAt) : '—'}
                  </div>
                  <div className="flex justify-end px-3 py-2.5">
                    <StateAndAction row={row} busy={busyId === row.id} onUnpublish={() => unpublish(row)} />
                  </div>
                </GridRow>
              )
            })}
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <div className="lg:hidden space-y-2">
          {view.map((row) => {
            const title = decodeHtmlEntities(row.title)
            return (
              <div key={row.id} className={cn('rounded-xl bg-slate-50 p-3', !row.isActive && 'text-slate-400')}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1">
                      <p className={cn('text-sm font-medium', row.isActive && 'text-slate-800')}>{title}</p>
                      <PostingLink url={row.url} title={title} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {[row.company, row.location, row.sourceName].filter(Boolean).join(' · ')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Published {publishedFormat.format(new Date(row.publishedAt))}
                      {row.closingAt && ` · Closes ${formatDate(row.closingAt)}`}
                    </p>
                  </div>
                  <StateAndAction row={row} busy={busyId === row.id} onUnpublish={() => unpublish(row)} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
