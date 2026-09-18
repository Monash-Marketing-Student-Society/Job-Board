'use client'

// Required, even though this renders no state: the Phosphor icons below are
// client-only (they call createContext), and without the directive a server
// component importing this — directly or through ./index.ts — crashes with
// "createContext is not a function".
import Link from 'next/link'
import { CaretLeftIcon, CaretRightIcon } from '@phosphor-icons/react'
import { segmentedTabsTriggerClassName } from '@/components/ui/segmented-tabs'
import { cn } from '@/lib/utils'
import { CHIP_SHAPE } from './table-styles'

interface AdminPaginationProps {
  currentPage: number
  totalPages: number
  baseUrl: string
  /** Other query params to keep on every page link (e.g. `view=archived`). */
  searchParams?: Record<string, string | undefined>
}

/**
 * Pagination for the admin tables, in the status tabs' language: a slate-100
 * track, page numbers as tab chips, the current page as the white chip, and
 * bare carets for previous/next. Replaces components/ui/pagination.tsx on the
 * admin pages only — that one's bordered Prev/Next boxes are what made the
 * table footer look like a separate component.
 *
 * Still plain links driven by the `page` search param, same contract as
 * before: the server component reads `page`, nothing client-side here.
 */
export function AdminPagination({ currentPage, totalPages, baseUrl, searchParams = {} }: AdminPaginationProps) {
  if (totalPages <= 1) return null

  const href = (page: number) => {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(searchParams)) {
      if (value) params.set(key, value)
    }
    params.set('page', String(page))
    return `${baseUrl}?${params.toString()}`
  }

  const caret = cn(CHIP_SHAPE, 'grid place-items-center text-slate-500 transition-colors hover:text-slate-900')
  const caretDisabled = cn(CHIP_SHAPE, 'grid place-items-center text-slate-500 opacity-35')

  return (
    <nav aria-label="Pagination" className="inline-flex items-center gap-1 rounded-xl bg-slate-100 p-1">
      {currentPage > 1 ? (
        <Link href={href(currentPage - 1)} aria-label="Previous page" className={caret}>
          <CaretLeftIcon weight="bold" className="size-3.5" />
        </Link>
      ) : (
        <span aria-hidden="true" className={caretDisabled}>
          <CaretLeftIcon weight="bold" className="size-3.5" />
        </span>
      )}

      {/* Page chips from sm up; a compact "2 / 5" below it. */}
      <div className="hidden items-center gap-1 sm:flex">
        {pageNumbers(currentPage, totalPages).map((page, i) =>
          page === 'ellipsis' ? (
            <span key={`ellipsis-${i}`} className="grid h-8 min-w-6 place-items-center text-sm text-slate-400">
              …
            </span>
          ) : (
            <Link
              key={page}
              href={href(page)}
              aria-current={page === currentPage ? 'page' : undefined}
              className={segmentedTabsTriggerClassName(
                page === currentPage,
                'grid h-8 min-w-8 place-items-center px-2.5 py-0 tabular-nums'
              )}
            >
              {page}
            </Link>
          )
        )}
      </div>
      <span className="px-2 text-sm tabular-nums text-slate-600 sm:hidden">
        {currentPage} / {totalPages}
      </span>

      {currentPage < totalPages ? (
        <Link href={href(currentPage + 1)} aria-label="Next page" className={caret}>
          <CaretRightIcon weight="bold" className="size-3.5" />
        </Link>
      ) : (
        <span aria-hidden="true" className={caretDisabled}>
          <CaretRightIcon weight="bold" className="size-3.5" />
        </span>
      )}
    </nav>
  )
}

/** First and last page always; up to one neighbour either side of the current
 *  page; an ellipsis for anything skipped. All pages when there are ≤ 7. */
function pageNumbers(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)

  const pages: (number | 'ellipsis')[] = [1]
  if (current > 3) pages.push('ellipsis')
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) pages.push(i)
  if (current < total - 2) pages.push('ellipsis')
  pages.push(total)
  return pages
}
