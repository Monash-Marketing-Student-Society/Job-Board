import type { InterestSlice } from '@/lib/analytics/buckets'

/**
 * The numbers behind an interest list, on demand.
 *
 * Kept from the two bar charts this page used to draw, and still worth keeping
 * now that they are ranked lists: the list shows the top slice with the tail
 * folded into "Other", and the table is where the exact pair of figures per
 * category lives — interactions *and* the visitors behind them, which the bar
 * cannot encode without becoming two bars.
 *
 * It is also the relief the palette needs. `--chart-4` and `--chart-5` sit
 * below 3:1 against white, so any chart using them owes a reader a way to get
 * the values as text rather than as length.
 */
export function InterestTable({
  data,
  dimensionLabel,
}: {
  data: InterestSlice[]
  dimensionLabel: string
}) {
  return (
    <details className="mt-3">
      <summary className="cursor-pointer select-none text-xs text-slate-500 hover:text-slate-800">
        View as table
      </summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="py-1.5 pr-4 font-medium">{dimensionLabel}</th>
              <th className="py-1.5 pr-4 text-right font-medium">Interactions</th>
              <th className="py-1.5 text-right font-medium">Visitors</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.label} className="border-b border-slate-100 last:border-0">
                <td className="py-1.5 pr-4">{row.label}</td>
                <td className="py-1.5 pr-4 text-right tabular-nums">{row.events}</td>
                <td className="py-1.5 text-right tabular-nums">{row.visitors}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}
