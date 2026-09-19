'use client'

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { Panel } from './panel'
import { evenlySpacedTicks } from '@/lib/analytics/buckets'
import type { FilledBucket } from '@/lib/analytics/buckets'

export const description = 'An area chart of job views and distinct viewers over the reporting period'

/**
 * Two series, one hue, one legend.
 *
 * The pair used to be genuinely indistinguishable: the shadcn migration
 * replaced the categorical palette in globals.css with the imported theme's
 * five-step purple ramp, so `--chart-1` and `--chart-2` became two purples a
 * few percent of lightness apart — and the chart carried no legend, so nothing
 * on screen said which was which.
 *
 * The fix is not a second hue. The dashboard reads as one purple family, so the
 * two series are separated *within* the hue instead: deep brand purple against
 * a light lilac, re-validated as a two-colour categorical set (ΔE 22.9 normal
 * vision and under colour-vision deficiency, against a floor of 15). What the
 * old pairing was actually missing was the legend, and that is no longer
 * optional — with two series, identity is never carried by colour alone.
 */
const chartConfig = {
  views: {
    label: 'Page Views',
    color: 'var(--chart-2)',
  },
  viewers: {
    label: 'Visitors',
    color: 'var(--chart-1)',
  },
} satisfies ChartConfig

/**
 * Job views and distinct viewers over the selected period.
 *
 * The two series are overlaid, not stacked. Job views already contains every
 * distinct viewer, so a stacked height would be a number that means nothing;
 * overlaying shows the gap between reach and repeat visits, which is the whole
 * point of drawing them together.
 *
 * The card used to carry its own range tabs, which meant the series could be
 * showing a week while the tiles above it reported a quarter. It shows exactly
 * the window the section it sits in names, and nothing on the card changes it.
 */
export function ChartViewersOverTime({
  data,
  cadence,
}: {
  data: FilledBucket[]
  /** "Daily" or "Weekly" — what one point on the line covers. */
  cadence: string
}) {
  const isWeekly = cadence.toLowerCase().startsWith('week')
  const ticks = evenlySpacedTicks(data.map((bucket) => bucket.label))

  return (
    <Panel title="Page Views & Visitors" bodyClassName="pt-1">
      <ChartContainer config={chartConfig} className="aspect-auto h-[280px] w-full">
        {/* The right margin is the last tick's other half: its label is centred
            on the final bucket, which sits flush against the plot's edge, so
            without the room the newest date renders as "14-0". */}
        <AreaChart data={data} margin={{ left: 4, right: 20, top: 10 }}>
          <defs>
            {/* The wash carries the shape; the stroke carries the identity.
                Both fade to nothing at the baseline so the two overlapping
                areas never build into a third, muddier colour. */}
            <linearGradient id="fillViews" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-views)" stopOpacity={0.3} />
              <stop offset="100%" stopColor="var(--color-views)" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="fillViewers" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-viewers)" stopOpacity={0.16} />
              <stop offset="100%" stopColor="var(--color-viewers)" stopOpacity={0.01} />
            </linearGradient>
          </defs>

          <CartesianGrid vertical={false} />

          {/* The chart had no value axis at all, so every point was a shape
              with no magnitude — "is that peak forty or four hundred?" had to
              be answered by hovering. Four ticks are enough to read a level
              off; more would compete with the series for attention. */}
          <YAxis
            tickLine={false}
            axisLine={false}
            tickCount={4}
            width={36}
            tickMargin={6}
            fontSize={11}
            allowDecimals={false}
            // A natural spline carries its curvature through each point, which
            // is what makes the line flow — and on a run of empty days beside a
            // busy one it carries that curvature below the baseline. Nobody had
            // minus four page views. Pinning the floor at zero and clipping to
            // the domain cuts the overshoot at the axis instead of drawing it.
            domain={[0, 'auto']}
            allowDataOverflow
          />

          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tickMargin={10}
            fontSize={11}
            // The ticks are chosen, not thinned. Recharts' own collision
            // avoidance drops labels one at a time and leaves the survivors
            // unevenly spaced, which reads as uneven time — see
            // `evenlySpacedTicks`. `interval={0}` stops it second-guessing the
            // list it is handed.
            ticks={ticks}
            interval={0}
          />

          <ChartTooltip cursor content={<ChartTooltipContent indicator="dot" />} />

          {/* Views is drawn first, and so sits behind: it is always the larger
              series, and painting it over viewers would hide them entirely.

              `natural` rather than `monotone`: both pass through every value,
              but monotone flattens its approach to each point to guarantee it
              never overshoots, which on daily data turns every weekend dip
              into a pair of hard shoulders. A natural spline carries its
              curvature through the point instead, which is the soft flow this
              chart is read for. */}
          <Area
            dataKey="views"
            isAnimationActive={false}
            type="natural"
            fill="url(#fillViews)"
            stroke="var(--color-views)"
            strokeWidth={2}
          />
          <Area
            dataKey="viewers"
            isAnimationActive={false}
            type="natural"
            fill="url(#fillViewers)"
            stroke="var(--color-viewers)"
            strokeWidth={2}
          />

          <ChartLegend content={<ChartLegendContent />} />
        </AreaChart>
      </ChartContainer>


      <details className="mt-3">
        <summary className="cursor-pointer select-none text-xs text-slate-500 hover:text-slate-800">
          View as table
        </summary>
        <div className="mt-2 max-h-64 overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="py-1.5 pr-4 font-medium">{isWeekly ? 'Week of' : 'Day'}</th>
                <th className="py-1.5 pr-4 text-right font-medium">Visitors</th>
                <th className="py-1.5 text-right font-medium">Page Views</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.bucketStart} className="border-b border-slate-100 last:border-0">
                  <td className="py-1.5 pr-4">{row.label}</td>
                  <td className="py-1.5 pr-4 text-right tabular-nums">{row.viewers}</td>
                  <td className="py-1.5 text-right tabular-nums">{row.views}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </Panel>
  )
}
