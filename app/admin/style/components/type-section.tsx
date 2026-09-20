'use client'

import { TYPE_SIZES, TYPE_WEIGHTS } from '../lib/tokens'
import { Probe, typeProbe } from './introspect'

const BODY_COPY =
  "MMSS partners with employers actively recruiting Monash marketing students, and every listing on this board is reviewed before it goes live — HR teams submit a role, an admin approves it, and it appears here with the original posting linked back for applicants."

const FONT_CHECKS: { context: string; className?: string; style?: React.CSSProperties; note: string }[] = [
  {
    context: 'Inherited default (this page\'s <body>)',
    note: 'RootLayout applies font-sans to <html>, not to <body> directly — <body> has no font className of its own and inherits Public Sans from there.',
  },
  {
    context: '`font-sans` utility',
    className: 'font-sans',
    note: 'Resolves through --font-sans, which is set to Public Sans — the single app font loaded via next/font in app/layout.tsx. Neither Inter nor Roboto exist in this codebase any more.',
  },
  {
    context: '`font-heading` utility',
    className: 'font-heading',
    note: 'globals.css defines --font-heading as its own var(--font-public-sans) — independently of --font-sans, not chained to it, though both resolve to the same Public Sans. Outfit is not wired to this token.',
  },
  {
    context: '`var(--font-outfit)` directly',
    style: { fontFamily: 'var(--font-outfit)' },
    note: 'Outfit is loaded (next/font) and reachable via inline style at the nav link call sites in components/navbar.tsx and components/admin/admin-nav.tsx — not through this token, and not via components/ui/modal.tsx, which uses font-heading (Public Sans) instead.',
  },
]

export function TypeSection() {
  return (
    <section className="space-y-8">
      <header>
        <p className="text-[13px] leading-relaxed text-slate-500">
          Sizes and weights below are Tailwind&apos;s default scale (app/globals.css doesn&apos;t
          override <code>--text-*</code> or <code>--font-weight-*</code>) — each sample still reads
          its own computed metrics live rather than repeating Tailwind&apos;s documented values.
        </p>
      </header>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Font family — what&apos;s actually loaded
        </h3>
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Context</th>
                <th className="px-3 py-2 font-medium">Renders as</th>
                <th className="px-3 py-2 font-medium">Resolved font-family</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {FONT_CHECKS.map((check) => (
                <tr key={check.context} className="align-top">
                  <td className="px-3 py-2 font-mono text-xs text-foreground">{check.context}</td>
                  <td className="max-w-xs px-3 py-2 text-xs text-muted-foreground">{check.note}</td>
                  <td className="px-3 py-2">
                    <Probe
                      as="span"
                      className={check.className}
                      style={check.style}
                      probe={typeProbe}
                      render={(v) => (
                        <span className="text-xs text-foreground">{v.fontFamily ?? '—'}</span>
                      )}
                    >
                      Sample
                    </Probe>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Scale</h3>
        <div className="space-y-3">
          {TYPE_SIZES.map((sample) => (
            <div key={sample.label} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-border pb-3">
              <Probe
                as="span"
                className={`${sample.className} text-foreground`}
                probe={typeProbe}
                render={(v) => (
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                    <code className="text-foreground">{sample.className}</code> · {v.fontSize} / {v.lineHeight}{' '}
                    · weight {v.fontWeight}
                  </span>
                )}
              >
                Marketing role
              </Probe>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Weight</h3>
        <div className="space-y-2">
          {TYPE_WEIGHTS.map((sample) => (
            <div key={sample.label} className="flex items-baseline gap-4">
              <Probe
                as="span"
                className={`text-lg ${sample.className} text-foreground`}
                probe={typeProbe}
                render={(v) => (
                  <span className="text-xs text-muted-foreground">
                    <code className="text-foreground">{sample.className}</code> · {v.fontWeight}
                  </span>
                )}
              >
                Graduate program
              </Probe>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Body copy sample
        </h3>
        <Probe
          as="p"
          className="max-w-2xl text-base leading-relaxed text-foreground"
          probe={typeProbe}
          render={(v) => (
            <p className="text-xs text-muted-foreground">
              text-base · {v.fontSize} / {v.lineHeight} · {v.fontFamily}
            </p>
          )}
        >
          {BODY_COPY}
        </Probe>
      </div>
    </section>
  )
}
