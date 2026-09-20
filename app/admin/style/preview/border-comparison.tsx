'use client'

/**
 * Border treatments, composed.
 *
 * The first cut of this lived on the Reference tab as a grid of isolated
 * specimens — one bordered rectangle per treatment, each in its own little
 * card. That answered "what does this edge look like" and completely failed
 * to answer the only question worth asking, which is whether a card, the
 * warning inside it, and the field under it read as one system or three.
 * A border is only ever seen next to other borders.
 *
 * So each column below is the *same* admin screen — section card, stat
 * strip, two table rows, a warning callout, a form field — rendered end to
 * end in one treatment. Compare columns, not rectangles: the tell is whether
 * the corners agree down a column and whether the warning looks like it
 * belongs to the card it sits in.
 *
 * Every class string is literal, copied from the call sites cited in each
 * column's footnote. Nothing here is a design proposal; column 3 is what the
 * admin actually ships today, mixed treatments and all.
 */

interface Treatment {
  key: string
  name: string
  summary: string
  /** The outer section/card surface. */
  card: string
  /** An inner tile — stat cards and nested panels. */
  tile: string
  /** A row divider inside a table. */
  row: string
  /** The warning callout. */
  warning: string
  /** Tint applied to the warning's own body text, if the call site does. */
  warningText: string
  /** A text input. */
  field: string
  sources: string[]
}

const TREATMENTS: Treatment[] = [
  {
    key: 'A',
    name: 'Token system',
    summary:
      'Everything resolves through app/globals.css. One radius base, one border colour, warning tinted at /20.',
    card: 'rounded-lg border border-border bg-card shadow-sm',
    tile: 'rounded-md border border-border bg-background',
    row: 'border-t border-border',
    warning: 'rounded-lg border border-warning/20 bg-warning/10',
    warningText: 'text-warning',
    field: 'rounded-md border border-input bg-input',
    sources: ['components/ui/card.tsx', 'components/ui/alert.tsx', 'components/ui/input.tsx'],
  },
  {
    key: 'B',
    name: 'Slate system',
    summary:
      'The look the admin pages mostly have today, made internally consistent: slate borders, 2xl corners, warning at /30.',
    card: 'rounded-2xl border border-slate-200 bg-white shadow-sm',
    tile: 'rounded-xl border border-slate-200 bg-white',
    row: 'border-t border-slate-100',
    warning: 'rounded-xl border border-warning/30 bg-warning/10',
    warningText: 'text-foreground',
    field: 'rounded-xl border border-slate-200 bg-white',
    sources: [
      'app/admin/users/page.tsx',
      'components/ui/confirm-dialog.tsx',
      'app/admin/analytics/loading.tsx',
    ],
  },
  {
    key: 'C',
    name: 'As shipped today',
    summary:
      'Not a candidate — the actual mixture currently on screen. A 20px section around 2xl tiles, a borderless warning, a half-pixel field.',
    card: 'rounded-[20px] border border-slate-200 bg-white shadow-sm',
    tile: 'rounded-2xl border border-slate-100 bg-white',
    row: 'border-t border-slate-100',
    warning: 'rounded-xl bg-warning/10',
    warningText: 'text-foreground',
    field: 'rounded-xl border-[0.5px] border-input bg-input',
    sources: [
      'components/admin/analytics/dashboard-section.tsx',
      'app/admin/submissions/[id]/preview/page.tsx',
      'components/ui/textarea.tsx',
    ],
  },
]

const ROWS = [
  { title: 'Marketing Intern', company: 'Acme Retail Co.', status: 'Pending' },
  { title: 'Brand Strategy Graduate', company: 'Nordic Studio', status: 'Approved' },
]

function Screen({ treatment }: { treatment: Treatment }) {
  return (
    <div className="flex flex-col gap-3">
      {/* The section card, with everything that normally sits inside one. */}
      <div className={treatment.card}>
        <div className="flex items-baseline justify-between px-4 pb-3 pt-4">
          <h4 className="text-sm font-semibold text-foreground">Submissions</h4>
          <span className="text-xs text-muted-foreground">Last 7 days</span>
        </div>

        {/* Stat strip — tiles nested inside the card, where two radii meet. */}
        <div className="grid grid-cols-2 gap-2 px-4 pb-3">
          {[
            { label: 'Pending', value: '12' },
            { label: 'Approved', value: '38' },
          ].map((stat) => (
            <div key={stat.label} className={`${treatment.tile} px-3 py-2`}>
              <div className="text-lg font-semibold tabular-nums text-foreground">{stat.value}</div>
              <div className="text-[11px] text-muted-foreground">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Table rows — the divider treatment. */}
        <div>
          {ROWS.map((row) => (
            <div
              key={row.title}
              className={`${treatment.row} flex items-center justify-between px-4 py-2.5`}
            >
              <div className="min-w-0">
                <div className="truncate text-xs font-medium text-foreground">{row.title}</div>
                <div className="truncate text-[11px] text-muted-foreground">{row.company}</div>
              </div>
              <span className="shrink-0 text-[11px] text-muted-foreground">{row.status}</span>
            </div>
          ))}
        </div>

        {/* Warning, inside the card — the pairing that matters most. */}
        <div className="px-4 pb-4 pt-3">
          <div className={`${treatment.warning} px-3 py-2.5`}>
            <p className={`text-[11px] leading-relaxed ${treatment.warningText}`}>
              <span className="font-semibold">Heads up — </span>
              approving this will email the submitter immediately.
            </p>
          </div>
        </div>
      </div>

      {/* A form field below the card, where the two radii are compared across
          a gap rather than nested. */}
      <div className={`${treatment.field} px-3 py-2 text-xs text-muted-foreground`}>
        Search submissions
      </div>
    </div>
  )
}

export function BorderComparison() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {TREATMENTS.map((t) => (
          <div key={t.key} className="space-y-3">
            <div className="space-y-1">
              <div className="flex items-baseline gap-2">
                <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                  {t.key === 'C' ? 'Current' : `Option ${t.key}`}
                </span>
                <h4 className="text-sm font-semibold text-foreground">{t.name}</h4>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">{t.summary}</p>
            </div>

            {/* The grey stage: these surfaces sit on bg-background in the real
                admin, and several of them were only ever reviewed on white. */}
            <div className="rounded-lg border border-border bg-background p-4">
              <Screen treatment={t} />
            </div>

            <ul className="space-y-0.5 text-[11px] text-muted-foreground/80">
              {t.sources.map((s) => (
                <li key={s}>
                  <code>{s}</code>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}
