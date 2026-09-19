import { ArrowDown, ArrowUp, Minus } from 'lucide-react'
import type { GrowthInsight } from '@/lib/analytics/growth'
import type { Trend, TrendDirection } from '@/lib/analytics/trend'

/**
 * Period-over-period movement, as one small line of text.
 *
 * Direction is carried three ways — an arrow, a sign and a colour — so the
 * figure survives both a colourblind reader and a black-and-white print of the
 * committee report. Colour alone would be the only cue that "+12%" and "−12%"
 * differ at a glance, and it is the cue most likely to be lost.
 *
 * There is no pill or chip behind it. On a tile the figure beside it is already
 * 30px of bold type; a filled badge next to that reads as a second thing to
 * look at, and the movement is a qualifier, not a headline.
 */

/** Tone for the arrow and the figure. Graph marks stay on the brand hue. */
function trendToneClass(direction: TrendDirection): string {
  switch (direction) {
    case 'up':
      return 'text-emerald-600'
    case 'down':
      return 'text-rose-600'
    default:
      return 'text-slate-400'
  }
}

/** "+44.6%" / "−0.4%" / "0%", with a real minus sign rather than a hyphen. */
export function formatDelta(changePct: number): string {
  if (changePct === 0) return '0%'
  return changePct > 0 ? `+${changePct}%` : `−${Math.abs(changePct)}%`
}

export function Delta({
  trend,
  className = '',
  /** What the movement is measured against, for screen readers. */
  periodLabel,
}: {
  trend: Trend
  className?: string
  periodLabel?: string
}) {
  if (trend.changePct === null) return null

  const { Icon, spoken } =
    trend.direction === 'up'
      ? { Icon: ArrowUp, spoken: 'Up' }
      : trend.direction === 'down'
        ? { Icon: ArrowDown, spoken: 'Down' }
        : { Icon: Minus, spoken: 'No change,' }

  const suffix = periodLabel ? ` versus the previous ${periodLabel}` : ''

  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums ${trendToneClass(
        trend.direction
      )} ${className}`}
    >
      <Icon className="h-3 w-3" aria-hidden />
      <span className="sr-only">{spoken}</span>
      {formatDelta(trend.changePct)}
      {suffix && <span className="sr-only">{suffix}</span>}
    </span>
  )
}

/**
 * The per-chart insight: how the leading category moved.
 *
 * Same treatment as a tile's delta, so "+18%" means the same thing wherever it
 * appears on the page, followed by the claim it belongs to. When there is no
 * honest percentage — too little history, too small a base — the sentence
 * stands on its own and names the leader without one.
 */
export function GrowthLine({ insight }: { insight: GrowthInsight }) {
  if (insight.direction === 'insufficient' || insight.changePct === null) {
    return <span className="text-slate-500">{insight.sentence}</span>
  }

  // The figure is already on the line; printing it twice would read as two
  // different numbers rather than one stated once.
  const claim = insight.sentence.replace(/^-?\d+%\s*/, '')

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Delta trend={{ changePct: insight.changePct, direction: insight.direction }} />
      <span className="text-slate-500">{claim}</span>
    </span>
  )
}
