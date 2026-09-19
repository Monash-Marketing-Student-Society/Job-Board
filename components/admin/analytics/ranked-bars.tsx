import { GrowthLine } from './delta'
import { Panel } from './panel'
import { InterestTable } from './interest-table'
import type { InterestSlice } from '@/lib/analytics/buckets'
import type { GrowthInsight } from '@/lib/analytics/growth'

/**
 * Interest in one dimension, as a ranked list.
 *
 * This replaces two Recharts bar charts — columns for job type, rows for tag —
 * and the entire class of problem they had, which was that the text never had
 * anywhere good to live. Columns put the category name in an x-axis tick, so
 * long names were truncated to fit or dropped when they collided; rows put the
 * name on top of the bar, where it was legible only while the bar stayed long
 * enough to hold it and the fill stayed light enough to read against.
 *
 * A list has no such conflict: the label sits on its own line at full length,
 * the figure is right-aligned where the eye already goes for numbers, and the
 * bar underneath carries the one thing text is bad at — relative size, seen at
 * a glance. Rank, label, count, share and length all read left to right in one
 * pass, and nothing overlaps at any width.
 *
 * The bar is a magnitude, so it is one hue at one value, not a colour per row.
 * Colouring rows individually would imply the categories are *kinds* of things
 * that differ by hue, when the only thing separating them here is how big they
 * are.
 */
export function RankedBars({
  title,
  growth,
  data,
  tableData,
  dimensionLabel,
  /** A chart token — one hue for the whole list. */
  barColor,
  emptyMessage,
}: {
  title: string
  growth: GrowthInsight
  /** The ranked rows to draw. A leaderboard, not an inventory. */
  data: InterestSlice[]
  /**
   * What the table shows, when that is more than the bars do — every label in
   * the vocabulary, including the ones that drew nothing. Defaults to the bars.
   */
  tableData?: InterestSlice[]
  dimensionLabel: string
  barColor: string
  emptyMessage: string
}) {
  const rows = tableData ?? data
  if (data.length === 0) {
    return (
      <Panel title={title}>
        <p className="py-6 text-center text-sm text-slate-500">{emptyMessage}</p>
      </Panel>
    )
  }

  // Shares are of everything, not of the five rows on screen: "25%" has to
  // mean a quarter of all tag interest, or the visible percentages add to 100
  // and quietly claim the tail does not exist.
  const total = rows.reduce((sum, slice) => sum + slice.events, 0)
  // Lengths are relative to the longest bar, not to the total: with eight
  // categories and a long tail, sizing by share would leave every row after
  // the second as an indistinguishable stub.
  const longest = Math.max(...data.map((slice) => slice.events), 1)

  return (
    <Panel
      title={title}
      description={<GrowthLine insight={growth} />}
      aside={
        <span className="text-[11px] tabular-nums text-slate-400">
          {formatCount(total)} interactions
        </span>
      }
    >
      <ol className="mt-1">
        {data.map((slice, index) => {
          const share = total === 0 ? 0 : (slice.events / total) * 100

          return (
            <li
              key={slice.label}
              className="border-b border-slate-100 py-2.5 last:border-0 last:pb-0 first:pt-0"
            >
              <div className="flex items-baseline gap-3">
                <span className="w-3.5 shrink-0 text-[11px] tabular-nums text-slate-300">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-slate-700 first-letter:uppercase">
                  {slice.label}
                </span>
                <span className="text-[13px] font-semibold tabular-nums text-slate-800">
                  {formatCount(slice.events)}
                </span>
                <span className="w-11 shrink-0 text-right text-[11px] tabular-nums text-slate-400">
                  {share.toFixed(1)}%
                </span>
              </div>

              <div
                className="mt-1.5 ml-7 h-1.5 overflow-hidden rounded-full bg-slate-100"
                role="presentation"
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max((slice.events / longest) * 100, 1.5)}%`,
                    backgroundColor: barColor,
                  }}
                />
              </div>
            </li>
          )
        })}
      </ol>

      <InterestTable data={rows} dimensionLabel={dimensionLabel} />
    </Panel>
  )
}

function formatCount(value: number): string {
  return new Intl.NumberFormat('en-AU').format(value)
}
