import { Delta } from './delta'
import { Sparkline } from './sparkline'
import type { MetricTile } from '@/lib/analytics/metrics'

/**
 * The headline tiles — one card per figure.
 *
 * These used to be four cells of a single divided strip, on the reasoning that
 * the gaps between separate cards were buying separation a hairline already
 * provided. That held while a cell was a label, a number and a qualifier. It
 * stops holding once each figure also carries its own movement and its own
 * 44px-tall shape: inside one continuous surface four sparklines read as one
 * broken line, and the divider that used to separate two numbers now has to
 * separate two little charts. Separate cards, each with its own edge, are what
 * keep them four independent claims.
 *
 * Every tile is the same three rows — label, figure, shape — so a reader's eye
 * lands in the same place on each one and the row scans horizontally. Where a
 * measure has no honest daily shape (a distinct count is not additive across
 * days) the third row carries the caveat instead, which is the one thing that
 * genuinely cannot be inferred from the label.
 */
export function MetricCards({
  tiles,
  periodLabel,
}: {
  tiles: MetricTile[]
  /** Lower-cased period, for the movement figure's screen-reader text. */
  periodLabel?: string
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {tiles.map((tile) => (
        <MetricCard key={tile.key} tile={tile} periodLabel={periodLabel} />
      ))}
    </div>
  )
}

function MetricCard({ tile, periodLabel }: { tile: MetricTile; periodLabel?: string }) {
  const hasShape = tile.series.length > 1

  return (
    <article className="flex min-h-[136px] flex-col justify-between rounded-xl border border-slate-200 bg-white px-5 pb-4 pt-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div>
        <p className="text-[13px] font-medium text-slate-500">{tile.label}</p>

        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <p className="font-heading text-[28px] font-bold leading-none tracking-tight text-slate-900 tabular-nums">
            {formatValue(tile)}
          </p>
          <Delta trend={tile.trend} periodLabel={periodLabel} />
        </div>
      </div>

      <div className="mt-3">
        {hasShape && (
          <Sparkline
            id={tile.key}
            values={tile.series}
            // One hue for every shape on the page, rising or falling. Painting
            // the line green or red made the movement the loudest thing in the
            // row — a −0.4% drift turned a whole tile red — and it said nothing
            // the arrow and the sign beside the figure had not already said.
            // The same value every other graph mark on the page uses; the
            // hex repeats it as a var() fallback, so a stale stylesheet can
            // never render this line in inherited near-black.
            className="h-11 text-[var(--graph-mark,#8367a3)]"
            label={`${tile.label}, day by day across the period`}
          />
        )}

        {/* Only ever present where it changes how the figure should be read —
            a count that cannot be summed, a total that is really a floor. The
            line is reserved on every tile that has a shape, note or not, so
            one caveat in a row does not push its neighbour's sparkline out of
            line with the rest. */}
        {(tile.note || hasShape) && (
          <p className="mt-1.5 min-h-[14px] text-pretty text-[11px] leading-snug text-slate-400">
            {tile.note}
          </p>
        )}
      </div>
    </article>
  )
}

function formatValue(tile: MetricTile): string {
  switch (tile.format) {
    case 'duration':
      return formatDuration(tile.value)
    case 'percent':
      return `${format(tile.value, 1)}%`
    case 'decimal':
      return format(tile.value, 1)
    default:
      return format(tile.value, 0)
  }
}

/**
 * Seconds as a reader says them: "48s", "5m 38s", "1h 02m".
 *
 * Never a bare count of seconds past a minute — "338s" is a number you have to
 * do arithmetic on before it means anything, and this figure exists to be read
 * at a glance.
 */
function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds))

  if (seconds < 60) return `${seconds}s`

  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60

  if (minutes < 60) return `${minutes}m ${String(rest).padStart(2, '0')}s`

  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`
}

function format(value: number, decimals: number): string {
  return new Intl.NumberFormat('en-AU', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}
