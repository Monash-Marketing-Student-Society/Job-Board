'use client'

import type { BorderUsageReport } from '../lib/scan'
import { Probe, boxProbe } from './introspect'

/**
 * Section 8 — the bordered-surface candidates currently in the app, rendered
 * side by side so one can be picked as the single rule.
 *
 * Every specimen below is a literal copy of the class string at its cited
 * call site, not an approximation: the point of the section is to compare
 * what the app actually paints, and a paraphrase would compare something
 * else. Each one is also measured live (`Probe`) rather than annotated by
 * hand, so the resolved radius and border colour under each specimen stay
 * true if a token moves.
 *
 * The specimens sit on a `bg-background` stage on purpose. Half of these
 * treatments were authored against white and only ever reviewed against
 * white, but the admin surfaces they live on sit on the brand grey — which
 * is lighter than `--border` — so that stage is where the difference between
 * them is actually visible.
 */

interface Candidate {
  key: string
  name: string
  /** Verbatim from the call site — see the file note above. */
  className: string
  where: string
  note: string
  /** Renders an inline chip rather than a block, for the one ring specimen. */
  inline?: boolean
}

const CARD_CANDIDATES: Candidate[] = [
  {
    key: 'A',
    name: 'Token card',
    className: 'rounded-lg border border-border bg-background shadow-sm',
    where: 'components/ui/card.tsx — the <Card> primitive',
    note:
      'The only candidate wired to the token layer. --border was retuned to oklch(0.85) precisely so it keeps a visible gap against the grey page; nothing else here got that retune.',
  },
  {
    key: 'B',
    name: 'Hard-coded slate card',
    className: 'rounded-2xl border border-slate-200 bg-white shadow-sm',
    where: 'app/admin/{users,jobs,submissions} and every loading.tsx',
    note:
      'The de-facto admin card, and the most-used border colour in the app. Bypasses the tokens entirely: #e2e8f0 is lighter than --border, so it reads softer than A on the same page.',
  },
  {
    key: 'C',
    name: 'Analytics section',
    className: 'rounded-[20px] border border-slate-200 bg-white shadow-sm',
    where: 'components/admin/analytics/dashboard-section.tsx',
    note:
      'B with a magic radius that sidesteps the --radius calc chain, so it no longer moves when the base radius does.',
  },
]

const WARNING_CANDIDATES: Candidate[] = [
  {
    key: 'D',
    name: 'Tinted alert · /20',
    className: 'rounded-lg border border-warning/20 bg-warning/10 text-warning p-4',
    where: 'components/ui/alert.tsx — the <Alert> primitive',
    note:
      'Border is the semantic colour at 20% and the body text is the full-strength colour. Same shape for success and destructive.',
  },
  {
    key: 'E',
    name: 'Tinted alert · /30',
    className: 'rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5',
    where: 'components/ui/confirm-dialog.tsx — the "Heads up" block',
    note:
      'The same idea as D, one step heavier, and it leaves its body text untinted. Reached only by dialogs that still pass a `warning`.',
  },
  {
    key: 'F',
    name: 'Borderless tint',
    className: 'rounded-xl bg-warning/10 px-4 py-3',
    where: 'app/admin/submissions/[id]/preview/page.tsx',
    note:
      'Same fill as D and E, no border at all — which is why it reads as a different component despite saying the same kind of thing.',
  },
  {
    key: 'G',
    name: 'Inset ring',
    className: 'rounded ring-1 ring-warning/30 bg-warning/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide',
    where: 'this page — the "unused" flag in section 6',
    note:
      'Draws with ring-1 rather than border, so the edge sits inside the box and costs no layout. A genuinely different mechanism, not just a different colour.',
    inline: true,
  },
]

const FIELD_CANDIDATE: Candidate = {
  key: 'H',
  name: 'Hairline field',
  className: 'rounded-xl border-[0.5px] border-input bg-input px-3 py-2',
  where: 'components/ui/textarea.tsx',
  note:
    'The only sub-pixel border in the app. A half-pixel edge resolves to 1px on some displays and disappears on others, so the textarea does not reliably match the Input beside it.',
}

function Specimen({ candidate }: { candidate: Candidate }) {
  const body = candidate.inline ? (
    <span className={candidate.className}>Deprecated</span>
  ) : (
    <div className={candidate.className}>
      <div className="text-sm font-medium">Submission received</div>
      <div className="text-xs opacity-70">Nordic Marketing Co · 2 days ago</div>
    </div>
  )

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="space-y-1.5 p-4">
        <div className="flex items-baseline gap-2">
          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
            Option {candidate.key}
          </span>
          <h4 className="text-sm font-semibold text-foreground">{candidate.name}</h4>
        </div>
        <p className="text-xs text-muted-foreground">{candidate.where}</p>
        <p className="text-xs text-muted-foreground">{candidate.note}</p>
        <code className="block break-words pt-1 text-[11px] leading-relaxed text-foreground/70">
          {candidate.className}
        </code>
      </div>

      {/* The grey stage — see the file note. */}
      <Probe
        className="border-t border-border bg-background p-5"
        probe={(el) => {
          const target = el.firstElementChild
          if (!target) return { borderRadius: null, borderTopWidth: null, borderTopColor: null }
          const cs = getComputedStyle(target)
          return {
            borderRadius: cs.borderRadius,
            borderTopWidth: cs.borderTopWidth,
            borderTopColor: cs.borderTopColor,
          }
        }}
        render={(v) => (
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            <span>radius {v.borderRadius ?? '—'}</span>
            <span>
              border {v.borderTopWidth ?? '—'}
              {v.borderTopWidth === '0px' ? '' : ` ${v.borderTopColor ?? ''}`}
            </span>
          </div>
        )}
      >
        {body}
      </Probe>
    </div>
  )
}

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
    <section className="space-y-8">
      <header>
        <h2 className="text-2xl font-semibold text-foreground">8. Borders</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Eight bordered treatments are in use across the site. Each specimen below carries the
          literal class string from its call site and is measured live, on the same{' '}
          <code>bg-background</code> grey the admin surfaces sit on — which is where they diverge,
          since several were authored against white. This section documents the split so one
          treatment can be adopted; it is not yet a decision.
        </p>
      </header>

      <div className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Cards and sections
        </h3>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {CARD_CANDIDATES.map((c) => (
            <Specimen key={c.key} candidate={c} />
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Warnings and callouts
        </h3>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {WARNING_CANDIDATES.map((c) => (
            <Specimen key={c.key} candidate={c} />
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Form fields
        </h3>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Specimen candidate={FIELD_CANDIDATE} />
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          How many values each axis holds
        </h3>
        <p className="text-xs text-muted-foreground/80">
          Counted by <code>scripts/audit-style-usage.mjs</code> across <code>app/</code>,{' '}
          <code>components/</code>, and <code>lib/</code>, excluding this route. The target for
          every row is one value — <code>rounded-full</code> on a pill and a divider&apos;s{' '}
          <code>border-t</code> are legitimately their own thing, but the colour row has no such
          excuse.
        </p>
        <AxisTable report={report} />
      </div>

      <div className="rounded-lg border border-warning/20 bg-warning/10 p-4">
        <p className="text-sm leading-relaxed text-foreground">
          <span className="font-semibold">Why it drifted: </span>
          <code>border-slate-200</code> outnumbers <code>border-border</code> across the app. Half
          the site was built against the tokens and half against raw Tailwind slate, so the two
          halves separated the moment <code>--border</code> was retuned to survive the grey page
          background. Picking a card rule and a warning rule from above closes it; the follow-up is
          the same shape either way — one card treatment, one warning treatment, and no raw{' '}
          <code>slate-*</code> or hex border left outside a divider.
        </p>
      </div>
    </section>
  )
}
