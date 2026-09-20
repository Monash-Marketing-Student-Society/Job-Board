'use client'

import { RADIUS_TOKENS } from '../lib/tokens'
import { Probe, boxProbe, rootVarProbe, type ProbeValues } from './introspect'
import { Button, Input } from '@/components/ui'

export function RadiusSection() {
  return (
    <section className="space-y-5">
      <header>
        <p className="text-[13px] leading-relaxed text-slate-500">
          <code>sm</code>–<code>4xl</code> are a calc() scale off one <code>--radius</code> base, so
          the slider above moves all of them. <code>xs</code> and <code>full</code> are Tailwind
          defaults.
        </p>
      </header>

      <div className="flex flex-wrap gap-6">
        {RADIUS_TOKENS.map((token) => (
          <div key={token.label} className="flex flex-col items-center gap-2">
            <Probe
              className={`h-16 w-16 border-2 border-primary bg-muted ${token.className}`}
              probe={boxProbe}
              render={(v) => (
                <div className="text-center text-xs">
                  <div className="font-medium text-foreground">{token.label}</div>
                  <div className="text-muted-foreground">{v.borderRadius}</div>
                  {!token.overridden && (
                    <div className="text-muted-foreground/60">default</div>
                  )}
                </div>
              )}
            />
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          What the real components resolve to
        </h3>
        <p className="text-xs text-muted-foreground/80">
          Measured on the actual rendered <code>&lt;button&gt;</code>/<code>&lt;input&gt;</code> element
          from <code>components/ui/</code>, not a re-created lookalike.
        </p>
        <div className="flex flex-wrap items-center gap-6">
          <ElementRadiusProbe selector="button" label="Button">
            <Button variant="primary">Button</Button>
          </ElementRadiusProbe>
          <ElementRadiusProbe selector="input" label="Input">
            <div className="w-48">
              <Input placeholder="Input" />
            </div>
          </ElementRadiusProbe>
        </div>
      </div>

      <div className="text-xs text-muted-foreground">
        Base <code>--radius</code>:{' '}
        <Probe className="hidden" probe={rootVarProbe(['--radius'])} render={(v) => <code>{v['--radius']}</code>} />
      </div>
    </section>
  )
}

function ElementRadiusProbe({
  selector,
  label,
  className,
  children,
}: {
  selector: string
  label: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <Probe
      className={`flex items-center gap-3 ${className ?? ''}`}
      probe={(el): ProbeValues => {
        const target = el.querySelector(selector)
        return { borderRadius: target ? getComputedStyle(target).borderRadius : null }
      }}
      render={(v) => (
        <span className="text-xs text-muted-foreground">
          {label} → {v.borderRadius ?? '—'}
        </span>
      )}
    >
      {children}
    </Probe>
  )
}
