import { Panel } from './panel'
import type { FunnelStep } from '@/lib/analytics/metrics'

/**
 * The board's reason for existing, in four steps.
 *
 * Every other block on this page reports a quantity; this one reports a
 * *sequence*, which is the only shape that answers the question the committee
 * actually asks — not "how many views did we get" but "how far down the path
 * do people get, and where do they fall off". Each step is a strict subset of
 * the one above it (every apply click follows a click, every click follows a
 * view), so the bars are directly comparable and the gap between two rows is a
 * real loss rather than two unrelated numbers drawn at different lengths.
 *
 * Each row carries its own share of the top step and nothing else. The
 * step-to-step drop-off used to be printed between the rows, and it made the
 * block twice as tall for a figure a reader can see in the bar lengths
 * themselves — four bars and four percentages say the shape of the funnel
 * without eight lines of prose running down the middle of it.
 *
 * The one thing the bars cannot say is that the last step is not measured the
 * way the first three are, so it is said once, underneath — see the footnote.
 */
export function ConversionFunnel({
  steps,
  className = '',
}: {
  steps: FunnelStep[]
  className?: string
}) {
  const hasAnything = steps.some((step) => step.value > 0)

  return (
    <Panel
      title="Conversion funnel"
      description="From opening the board to confirming an application"
      className={className}
    >
      {hasAnything ? (
        <ol className="mt-2 space-y-2.5">
          {steps.map((step, index) => (
            <li key={step.key}>
              {/* Below sm the label column would leave the bar about eighty
                  pixels to say everything in, so the row folds: label and
                  figure share a line and the bar takes the full width under
                  them. The reading order is the same either way. */}
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                <div className="flex items-baseline justify-between gap-3 sm:w-[132px] sm:shrink-0">
                  <span className="text-[13px] font-medium text-slate-700">{step.label}</span>
                  <Figure step={step} className="sm:hidden" />
                </div>

                {/* `flex-1` only from sm: in the stacked column layout it would
                    set the flex basis on the *height* and collapse the bar to
                    nothing. */}
                <div className="h-6 w-full min-w-0 overflow-hidden rounded-md bg-slate-100 sm:flex-1">
                  <div
                    className="h-full rounded-md"
                    style={{
                      width: `${Math.max(step.shareOfTop * 100, 1)}%`,
                      // Four stages of one journey, so one colour: the length
                      // of the bar is the whole encoding, and a different hue on
                      // the last step implied a difference in kind that is not
                      // there. The soft step — every length here is labelled,
                      // so the bars do not have to carry the reading on their
                      // own.
                      backgroundColor: 'var(--graph-mark, #8367a3)',
                    }}
                  />
                </div>

                <Figure step={step} className="hidden sm:block sm:w-[104px] sm:text-right" />
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="py-6 text-center text-sm text-slate-500">
          No tracked activity in this period yet
        </p>
      )}

      {/* Stated once, at the bottom, rather than as a line under the row it
          belongs to: the first three steps are things the board watched
          happen, and the fourth is something a visitor chose to tell us. A
          reader who plans around it without knowing that is reading a floor as
          a total. */}
      {hasAnything && (
        <p className="mt-4 text-[11px] leading-snug text-slate-400">
          Confirmed applications count only the visitors who came back to the board and told
          us they applied, so the real number is higher.
        </p>
      )}
    </Panel>
  )
}

/** The count and its share of the top step, as one figure. */
function Figure({ step, className = '' }: { step: FunnelStep; className?: string }) {
  return (
    <span className={`shrink-0 text-[13px] tabular-nums ${className}`}>
      <span className="font-semibold text-slate-800">
        {new Intl.NumberFormat('en-AU').format(step.value)}
      </span>
      <span className="text-slate-400"> · {formatPercent(step.shareOfTop)}</span>
    </span>
  )
}

/** Whole percents above 10, one decimal below — "2%" hides a real difference. */
function formatPercent(share: number): string {
  const percent = share * 100
  return percent >= 10 ? `${Math.round(percent)}%` : `${percent.toFixed(1)}%`
}
