/**
 * The tokens the style pages let you move, and what moving one is expected
 * to repaint.
 *
 * Only tokens that genuinely drive the app are listed. `--radius` is the one
 * with reach: every other radius in the theme is a calc() off it, so one
 * slider moves the whole scale. The colour entries are the semantic set —
 * the brand purple, the border, the three status hues.
 *
 * `reaches` is the honest part. Roughly half the app's borders are written
 * as `border-slate-200` rather than `border-border`, so a `--border` change
 * moves one half and leaves the other exactly where it is. That is the
 * drift these pages exist to show, and it is why each control says what it
 * cannot touch.
 */

export type AdjustableKind = 'length' | 'color'

export interface AdjustableToken {
  /** The CSS custom property, as written in app/globals.css. */
  name: string
  label: string
  kind: AdjustableKind
  /** Value in :root today — the reset target and the diff's baseline. */
  initial: string
  /** Slider bounds, in rem. Length tokens only. */
  min?: number
  max?: number
  step?: number
  /** What this repaints. */
  reaches: string
  /** What it looks like it should repaint but does not. */
  misses?: string
}

export const ADJUSTABLE_TOKENS: AdjustableToken[] = [
  {
    name: '--radius',
    label: 'Radius base',
    kind: 'length',
    initial: '0.875rem',
    min: 0,
    max: 2,
    step: 0.0625,
    reaches: 'sm/md/lg/xl/2xl/3xl/4xl — the whole scale is a calc() off this',
    misses: 'rounded-[20px], rounded-[15px], rounded-[2px] — 10 hard-coded corners',
  },
  {
    name: '--primary',
    label: 'Brand purple',
    kind: 'color',
    initial: '#6b4d8a',
    reaches: 'buttons, links, focus states, chart-1',
    misses: 'border-purple-200, and #6b4d8a written literally in the chart palette',
  },
  {
    name: '--border',
    label: 'Border',
    kind: 'color',
    initial: 'oklch(0.85 0 0)',
    reaches: 'every border-border consumer, and the * base rule',
    misses: '44 border-slate-200 call sites, border-slate-100, border-[#d5d5d5]',
  },
  {
    name: '--background',
    label: 'Page background',
    kind: 'color',
    initial: '#e8e8e8',
    reaches: 'the page ground, and every bg-background surface',
    misses: 'bg-white, written directly on most admin cards',
  },
  {
    name: '--warning',
    label: 'Warning',
    kind: 'color',
    initial: 'oklch(0.769 0.188 70.08)',
    reaches: 'Alert + Badge warning variants, StatusDot pending',
    misses: 'bg-red-100 in the submissions skeleton',
  },
  {
    name: '--success',
    label: 'Success',
    kind: 'color',
    initial: '#059669',
    reaches: 'Alert + Badge success variants, StatusDot approved',
    misses: 'border-green-300',
  },
  {
    name: '--destructive',
    label: 'Destructive',
    kind: 'color',
    initial: '#d23a34',
    reaches: 'destructive Button/Badge/Alert, invalid form fields',
  },
]

/** `--destructive` is written as `--mmss-destructive` in :root. */
export const TOKEN_SOURCE_NAME: Record<string, string> = {
  '--destructive': '--mmss-destructive',
  '--background': '--mmss-background',
  '--success': '--mmss-success',
}

export const OVERRIDES_STORAGE_KEY = 'mmss-style-token-overrides'
export const NOTES_STORAGE_KEY = 'mmss-style-notes'
