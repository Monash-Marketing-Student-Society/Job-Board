'use client'

import type { BorderUsageReport } from '../lib/scan'

/**
 * Section 8 — how many distinct values each axis of a bordered surface
 * currently holds.
 *
 * This section used to also carry a grid of isolated specimens, one
 * bordered rectangle per treatment. That was the wrong page for them and
 * the wrong framing: an edge in isolation tells you nothing about whether
 * a card, the warning inside it and the field under it read as one system,
 * and that is the actual question. The specimens now live on the Preview
 * tab as three composed admin screens, which is what that tab is for.
 *
 * What stays here is the part that genuinely is reference material: the
 * generated counts, which say how far from one-value-per-axis the app is.
 */

function AxisTable({ report }: { report: BorderUsageReport }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="px-2 py-2 font-medium text-muted-foreground">Axis</th>
            <th className="px-2 py-2 font-medium text-muted-foreground">Distinct</th>
            <th className="px-2 py-2 font-medium text-muted-foreground">Values, most used first</th>
          </tr>
        </thead>
        <tbody>
          {report.axes.map((axis) => (
            <tr key={axis.axis} className="border-b border-border align-top">
              <td className="whitespace-nowrap px-2 py-3 text-xs font-medium text-foreground">
                {axis.label}
              </td>
              <td className="px-2 py-3 text-xs tabular-nums text-muted-foreground">
                {axis.distinct}
              </td>
              <td className="px-2 py-3">
                <div className="flex flex-wrap gap-1.5">
                  {axis.values.map((v) => (
                    <span
                      key={v.className}
                      className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
                    >
                      <code>{v.className}</code>{' '}
                      <span className="tabular-nums text-foreground/60">{v.count}</span>
                    </span>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function BorderSection({ report }: { report: BorderUsageReport }) {
  return (
    <section className="space-y-5">
      <header>
        <p className="text-[13px] leading-relaxed text-slate-500">
          No single border rule exists yet. The table below counts how many distinct values each
          axis of a bordered surface currently holds, across <code>app/</code>,{' '}
          <code>components/</code>, and <code>lib/</code>, excluding this route. To judge the
          treatments against each other, see{' '}
          <a
            href="/admin/style/preview"
            className="underline underline-offset-2 hover:text-foreground"
          >
            Preview
          </a>
          , where each one is rendered as a complete admin screen — a card, the warning inside it,
          and the field under it — rather than as a row of isolated edges.
        </p>
      </header>

      <AxisTable report={report} />

      <p className="text-xs text-muted-foreground/80">
        The target for every row is one value. <code>rounded-full</code> on a pill and a
        divider&apos;s <code>border-t</code> are legitimately their own thing; the colour row has no
        such excuse.
      </p>

      <div className="rounded-lg border border-warning/20 bg-warning/10 p-4">
        <p className="text-sm leading-relaxed text-foreground">
          <span className="font-semibold">Why it drifted: </span>
          <code>border-slate-200</code> outnumbers <code>border-border</code> across the app. Half
          the site was built against the tokens and half against raw Tailwind slate, so the two
          halves separated the moment <code>--border</code> was retuned to survive the grey page
          background. The follow-up is the same shape whichever treatment wins — one card rule, one
          warning rule, and no raw <code>slate-*</code> or hex border left outside a divider.
        </p>
      </div>
    </section>
  )
}
