'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ADJUSTABLE_TOKENS,
  OVERRIDES_STORAGE_KEY,
  TOKEN_SOURCE_NAME,
  type AdjustableToken,
} from '../lib/adjustable'

/**
 * Live token controls, shared by both style tabs.
 *
 * Overrides are set as inline custom properties on <html>, which beats the
 * :root rule in app/globals.css without touching it, so every component on
 * the page — real ones, not copies — repaints as you drag. Nothing is
 * written to disk; the diff panel is what carries a change back into the
 * codebase.
 *
 * They persist to localStorage so a change survives switching between
 * Reference and Preview, which is the whole point of being able to judge
 * one. `Reset all` is always one click away, and the banner only appears
 * while something is actually overridden — an experiment should never be
 * mistakable for what the app ships.
 */

type Overrides = Record<string, string>

function readStored(): Overrides {
  try {
    const raw = localStorage.getItem(OVERRIDES_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Overrides) : {}
  } catch {
    return {}
  }
}

/** Slider position for a length token, in rem. */
function remOf(value: string) {
  const n = Number.parseFloat(value)
  return Number.isFinite(n) ? n : 0
}

function ColorControl({
  token,
  value,
  onChange,
}: {
  token: AdjustableToken
  value: string
  onChange: (next: string) => void
}) {
  // <input type="color"> only speaks hex, so an oklch() token has no
  // meaningful swatch position until it is overridden. Showing the resolved
  // colour instead would imply the picker round-trips it, which it does not.
  const isHex = value.startsWith('#')

  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        aria-label={`${token.label} colour`}
        value={isHex ? value : '#888888'}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 w-10 shrink-0 cursor-pointer rounded border border-border bg-transparent"
      />
      <input
        type="text"
        aria-label={`${token.label} value`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        className="min-w-0 flex-1 rounded border border-border bg-card px-2 py-1 font-mono text-[11px] text-foreground"
      />
    </div>
  )
}

function LengthControl({
  token,
  value,
  onChange,
}: {
  token: AdjustableToken
  value: string
  onChange: (next: string) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="range"
        aria-label={`${token.label} size`}
        min={token.min ?? 0}
        max={token.max ?? 2}
        step={token.step ?? 0.0625}
        value={remOf(value)}
        onChange={(e) => onChange(`${e.target.value}rem`)}
        className="min-w-0 flex-1 accent-primary"
      />
      <span className="w-16 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
        {value}
      </span>
    </div>
  )
}

export function TokenControls() {
  const [overrides, setOverrides] = useState<Overrides>({})
  const [copied, setCopied] = useState(false)

  // localStorage is read after mount, never during render — the server has
  // no access to it, and reading it in render would desync hydration.
  useEffect(() => {
    setOverrides(readStored())
  }, [])

  useEffect(() => {
    const root = document.documentElement
    for (const token of ADJUSTABLE_TOKENS) {
      const sourceName = TOKEN_SOURCE_NAME[token.name] ?? token.name
      const override = overrides[token.name]
      if (override) {
        root.style.setProperty(sourceName, override)
        // A token with a --mmss-* source also has a shadcn-facing alias that
        // points at it via var(); setting the source is enough. Where the two
        // names are the same this is a no-op.
        if (sourceName !== token.name) root.style.setProperty(token.name, override)
      } else {
        root.style.removeProperty(sourceName)
        root.style.removeProperty(token.name)
      }
    }
    try {
      localStorage.setItem(OVERRIDES_STORAGE_KEY, JSON.stringify(overrides))
    } catch {
      // Private window or blocked site data — the overrides still apply for
      // this page view, they just will not survive the tab.
    }
  }, [overrides])

  const set = useCallback((name: string, next: string) => {
    setOverrides((prev) => ({ ...prev, [name]: next }))
  }, [])

  const clear = useCallback((name: string) => {
    setOverrides((prev) => {
      const next = { ...prev }
      delete next[name]
      return next
    })
  }, [])

  const changed = useMemo(
    () => ADJUSTABLE_TOKENS.filter((t) => overrides[t.name] && overrides[t.name] !== t.initial),
    [overrides]
  )

  const diff = useMemo(() => {
    if (!changed.length) return ''
    const lines = changed.map((t) => {
      const name = TOKEN_SOURCE_NAME[t.name] ?? t.name
      return `  ${name}: ${overrides[t.name]};`
    })
    return `:root {\n${lines.join('\n')}\n}`
  }, [changed, overrides])

  async function copyDiff() {
    try {
      await navigator.clipboard.writeText(diff)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">Adjust tokens</h3>
        <p className="text-xs text-muted-foreground">
          Live preview only — nothing is saved to <code>globals.css</code>.
        </p>
      </div>

      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {ADJUSTABLE_TOKENS.map((token) => {
          const value = overrides[token.name] ?? token.initial
          const isChanged = value !== token.initial
          return (
            <div key={token.name} className="space-y-1">
              <div className="flex items-baseline justify-between gap-2">
                <label className="text-xs font-medium text-foreground">
                  {token.label}{' '}
                  <code className="text-[10px] font-normal text-muted-foreground">
                    {token.name}
                  </code>
                </label>
                {isChanged && (
                  <button
                    type="button"
                    onClick={() => clear(token.name)}
                    className="text-[10px] text-primary underline underline-offset-2"
                  >
                    reset
                  </button>
                )}
              </div>

              {token.kind === 'length' ? (
                <LengthControl token={token} value={value} onChange={(v) => set(token.name, v)} />
              ) : (
                <ColorControl token={token} value={value} onChange={(v) => set(token.name, v)} />
              )}

              <p className="text-[10px] leading-snug text-muted-foreground">
                Moves {token.reaches}.
              </p>
              {token.misses && (
                <p className="text-[10px] leading-snug text-warning">
                  Will not move {token.misses}.
                </p>
              )}
            </div>
          )
        })}
      </div>

      {changed.length > 0 && (
        <div className="space-y-2 rounded-md border border-warning/30 bg-warning/10 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium text-foreground">
              {changed.length} token{changed.length === 1 ? '' : 's'} overridden — this is not what
              the site ships.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={copyDiff}
                className="rounded border border-border bg-card px-2 py-1 text-[11px] font-medium text-foreground hover:bg-muted"
              >
                {copied ? 'Copied' : 'Copy CSS'}
              </button>
              <button
                type="button"
                onClick={() => setOverrides({})}
                className="rounded border border-border bg-card px-2 py-1 text-[11px] font-medium text-foreground hover:bg-muted"
              >
                Reset all
              </button>
            </div>
          </div>
          <pre className="overflow-x-auto rounded bg-background p-2 font-mono text-[11px] leading-relaxed text-foreground">
            {diff}
          </pre>
        </div>
      )}
    </div>
  )
}
