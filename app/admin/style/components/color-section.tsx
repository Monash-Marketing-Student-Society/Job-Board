'use client'

import { COLOR_GROUPS, PRIMARY_SCALE, type ColorToken } from '../lib/tokens'
import { Probe, colorProbe } from './introspect'

function Swatch({ token }: { token: ColorToken }) {
  return (
    <div className="flex items-center gap-4 rounded-md border border-border p-3">
      <Probe
        className={`h-12 w-12 shrink-0 rounded-md border border-border ${token.bgClass}`}
        probe={colorProbe}
        render={(v) => (
          <div className="min-w-0 text-sm">
            <div className="font-medium text-foreground">{token.label}</div>
            <div className="truncate text-muted-foreground">
              {v.backgroundHex ?? '—'} · <code className="text-xs">{token.usageClass}</code>
            </div>
            <div className="truncate text-xs text-muted-foreground/70">{token.cssVar}</div>
          </div>
        )}
      />
    </div>
  )
}

function PairCard({ token }: { token: ColorToken }) {
  const fg = token.foreground!
  return (
    <div className="overflow-hidden rounded-md border border-border">
      <Probe
        className={`flex h-16 items-center justify-center text-sm font-medium ${token.bgClass} ${fg.textClass}`}
        probe={colorProbe}
        render={() => null}
      >
        Ag {token.label}
      </Probe>
      <div className="grid grid-cols-2 divide-x divide-border border-t border-border text-xs">
        <SwatchCell label={token.label} bgClass={token.bgClass} usageClass={token.usageClass} cssVar={token.cssVar} />
        <SwatchCell label={fg.label} bgClass={fg.textClass.replace('text-', 'bg-')} usageClass={fg.usageClass} cssVar={fg.cssVar} />
      </div>
    </div>
  )
}

function SwatchCell({
  label,
  bgClass,
  usageClass,
  cssVar,
}: {
  label: string
  bgClass: string
  usageClass: string
  cssVar: string
}) {
  return (
    <Probe
      className={`sr-only ${bgClass}`}
      probe={colorProbe}
      render={(v) => (
        <div className="p-2">
          <div className="font-medium text-foreground">{label}</div>
          <div className="text-muted-foreground">{v.backgroundHex ?? '—'}</div>
          <code className="text-muted-foreground/80">{usageClass}</code>
          <div className="truncate text-muted-foreground/60">{cssVar}</div>
        </div>
      )}
    />
  )
}

export function ColorSection() {
  return (
    <section className="space-y-8">
      <header>
        <p className="text-[13px] leading-relaxed text-slate-500">
          Painted with each token&apos;s real Tailwind class, then read back via{' '}
          <code>getComputedStyle</code> — nothing typed by hand.
        </p>
      </header>

      {COLOR_GROUPS.map((group) => (
        <div key={group.role} className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {group.role}
          </h3>
          {group.note && <p className="text-xs text-muted-foreground/80">{group.note}</p>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.tokens.map((token) =>
              token.foreground ? (
                <PairCard key={token.label} token={token} />
              ) : (
                <Swatch key={token.label} token={token} />
              )
            )}
          </div>
        </div>
      ))}

      <div className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Brand ramp (primary-50 … primary-900)
        </h3>
        <p className="text-xs text-muted-foreground/80">
          Fixed brand steps — not remapped by <code>--primary</code>, unlike the semantic{' '}
          <code>primary</code> token above.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {PRIMARY_SCALE.map((token) => (
            <Swatch key={token.label} token={token} />
          ))}
        </div>
      </div>
    </section>
  )
}
