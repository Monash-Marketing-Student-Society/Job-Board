import { cn } from '@/lib/utils'

interface GridRowProps {
  /**
   * The grid's column template as a literal Tailwind arbitrary-value class,
   * e.g. `grid-cols-[40px_minmax(0,1fr)_112px_112px_52px]` — written out at
   * the call site (not built from a dynamic string) so Tailwind's JIT scanner
   * can actually see it; a class assembled at runtime from a prop value
   * never gets generated. Each table defines its own template and passes it
   * through unchanged.
   */
  columnsClassName: string
  header?: boolean
  className?: string
  children: React.ReactNode
}

/**
 * Row chrome shared by the jobs and submissions grids, with the column
 * widths left to each caller.
 *
 * No divider lines. The header is a rounded slate-100 shelf at the tabs'
 * track size (TRACK_SHAPE in ./table-styles), and body rows separate on a
 * rounded hover fill and spacing. That only works because the table card is
 * padded (tableCardClassName) rather than drawing rows edge to edge — the
 * rounded fills need room inside the card's own corners.
 *
 * Cells should all use the same horizontal padding (px-3), so the header and
 * body line up by construction instead of by per-column compensation.
 */
export function GridRow({ columnsClassName, header = false, className, children }: GridRowProps) {
  return (
    <div
      role="row"
      className={cn(
        'grid items-center rounded-xl',
        header ? 'h-10 bg-slate-100/70' : 'transition-colors hover:bg-slate-50',
        columnsClassName,
        className
      )}
    >
      {children}
    </div>
  )
}
