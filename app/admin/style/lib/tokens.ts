/**
 * Registry of the token *names* and Tailwind *class names* this page
 * documents. No color, size, or shadow values live here — those are only
 * ever read live off the DOM (see dom-color.ts). This file just says which
 * tokens exist and how to render a swatch that exercises each one.
 *
 * Sourced from the `@theme inline` block in app/globals.css — update this
 * list if a token is added or removed there.
 */

export interface ColorToken {
  /** Display label. */
  label: string
  /** The bg-{x} class used to render the swatch and read its resolved color. */
  bgClass: string
  /** The realistic Tailwind utility a consumer would reach for. */
  usageClass: string
  /** The CSS custom property backing it. */
  cssVar: string
  /** Paired foreground token, if this is a surface/fill token. */
  foreground?: {
    label: string
    textClass: string
    usageClass: string
    cssVar: string
  }
}

export interface ColorGroup {
  role: string
  note?: string
  tokens: ColorToken[]
}

export const COLOR_GROUPS: ColorGroup[] = [
  {
    role: 'Surface',
    tokens: [
      {
        label: 'background',
        bgClass: 'bg-background',
        usageClass: 'bg-background',
        cssVar: '--color-background',
        foreground: {
          label: 'foreground',
          textClass: 'text-foreground',
          usageClass: 'text-foreground',
          cssVar: '--color-foreground',
        },
      },
      {
        label: 'card',
        bgClass: 'bg-card',
        usageClass: 'bg-card',
        cssVar: '--color-card',
        foreground: {
          label: 'card-foreground',
          textClass: 'text-card-foreground',
          usageClass: 'text-card-foreground',
          cssVar: '--color-card-foreground',
        },
      },
      {
        label: 'popover',
        bgClass: 'bg-popover',
        usageClass: 'bg-popover',
        cssVar: '--color-popover',
        foreground: {
          label: 'popover-foreground',
          textClass: 'text-popover-foreground',
          usageClass: 'text-popover-foreground',
          cssVar: '--color-popover-foreground',
        },
      },
      {
        label: 'muted',
        bgClass: 'bg-muted',
        usageClass: 'bg-muted',
        cssVar: '--color-muted',
        foreground: {
          label: 'muted-foreground',
          textClass: 'text-muted-foreground',
          usageClass: 'text-muted-foreground',
          cssVar: '--color-muted-foreground',
        },
      },
      {
        label: 'sidebar',
        bgClass: 'bg-sidebar',
        usageClass: 'bg-sidebar',
        cssVar: '--color-sidebar',
        foreground: {
          label: 'sidebar-foreground',
          textClass: 'text-sidebar-foreground',
          usageClass: 'text-sidebar-foreground',
          cssVar: '--color-sidebar-foreground',
        },
      },
    ],
  },
  {
    role: 'Fill',
    tokens: [
      {
        label: 'primary',
        bgClass: 'bg-primary',
        usageClass: 'bg-primary',
        cssVar: '--color-primary',
        foreground: {
          label: 'primary-foreground',
          textClass: 'text-primary-foreground',
          usageClass: 'text-primary-foreground',
          cssVar: '--color-primary-foreground',
        },
      },
      {
        label: 'secondary',
        bgClass: 'bg-secondary',
        usageClass: 'bg-secondary',
        cssVar: '--color-secondary',
        foreground: {
          label: 'secondary-foreground',
          textClass: 'text-secondary-foreground',
          usageClass: 'text-secondary-foreground',
          cssVar: '--color-secondary-foreground',
        },
      },
      {
        label: 'accent',
        bgClass: 'bg-accent',
        usageClass: 'bg-accent',
        cssVar: '--color-accent',
        foreground: {
          label: 'accent-foreground',
          textClass: 'text-accent-foreground',
          usageClass: 'text-accent-foreground',
          cssVar: '--color-accent-foreground',
        },
      },
      {
        label: 'sidebar-primary',
        bgClass: 'bg-sidebar-primary',
        usageClass: 'bg-sidebar-primary',
        cssVar: '--color-sidebar-primary',
        foreground: {
          label: 'sidebar-primary-foreground',
          textClass: 'text-sidebar-primary-foreground',
          usageClass: 'text-sidebar-primary-foreground',
          cssVar: '--color-sidebar-primary-foreground',
        },
      },
      {
        label: 'sidebar-accent',
        bgClass: 'bg-sidebar-accent',
        usageClass: 'bg-sidebar-accent',
        cssVar: '--color-sidebar-accent',
        foreground: {
          label: 'sidebar-accent-foreground',
          textClass: 'text-sidebar-accent-foreground',
          usageClass: 'text-sidebar-accent-foreground',
          cssVar: '--color-sidebar-accent-foreground',
        },
      },
    ],
  },
  {
    role: 'Semantic state',
    note: "warning's swatch below is read live, not asserted here — if it renders unstyled ('—'), --color-warning/--color-warning-foreground aren't defined in app/globals.css on whatever branch is currently checked out; a real color means they are. Whether Badge's own \"warning\" variant (see Components section) matches, or still fakes itself via bg-accent, is worth checking directly in components/ui/badge.tsx rather than trusting a claim here — this exact pair of facts has been mid-fix across branches, which is precisely the kind of thing static prose gets wrong the moment someone merges.",
    tokens: [
      {
        label: 'success',
        bgClass: 'bg-success',
        usageClass: 'bg-success',
        cssVar: '--color-success',
        foreground: {
          label: 'success-foreground',
          textClass: 'text-success-foreground',
          usageClass: 'text-success-foreground',
          cssVar: '--color-success-foreground',
        },
      },
      {
        label: 'warning',
        bgClass: 'bg-warning',
        usageClass: 'bg-warning',
        cssVar: '--color-warning',
        foreground: {
          label: 'warning-foreground',
          textClass: 'text-warning-foreground',
          usageClass: 'text-warning-foreground',
          cssVar: '--color-warning-foreground',
        },
      },
      {
        label: 'destructive',
        bgClass: 'bg-destructive',
        usageClass: 'bg-destructive',
        cssVar: '--color-destructive',
        foreground: {
          label: 'destructive-foreground',
          textClass: 'text-destructive-foreground',
          usageClass: 'text-destructive-foreground',
          cssVar: '--color-destructive-foreground',
        },
      },
    ],
  },
  {
    role: 'Border / ring',
    note: 'Swatches read the token as a background for a clean color sample — the token itself is normally consumed via border-*/ring-*, named below.',
    tokens: [
      { label: 'border', bgClass: 'bg-border', usageClass: 'border-border', cssVar: '--color-border' },
      { label: 'input', bgClass: 'bg-input', usageClass: 'border-input', cssVar: '--color-input' },
      { label: 'ring', bgClass: 'bg-ring', usageClass: 'ring-ring', cssVar: '--color-ring' },
      { label: 'sidebar-border', bgClass: 'bg-sidebar-border', usageClass: 'border-sidebar-border', cssVar: '--color-sidebar-border' },
    ],
  },
  {
    role: 'Chart',
    note: 'The two-series chart. Every other graph mark uses --graph-mark instead.',
    tokens: [
      { label: 'chart-1', bgClass: 'bg-chart-1', usageClass: 'bg-chart-1 / stroke-chart-1', cssVar: '--color-chart-1' },
      { label: 'chart-2', bgClass: 'bg-chart-2', usageClass: 'bg-chart-2 / stroke-chart-2', cssVar: '--color-chart-2' },
    ],
  },
]

export const PRIMARY_SCALE: ColorToken[] = [
  '50', '100', '200', '300', '400', '500', '600', '700', '800', '900',
].map((step) => ({
  label: `primary-${step}`,
  bgClass: `bg-primary-${step}`,
  usageClass: `bg-primary-${step}`,
  cssVar: `--color-primary-${step}`,
}))

export interface TypeSample {
  label: string
  className: string
}

export const TYPE_SIZES: TypeSample[] = [
  { label: 'xs', className: 'text-xs' },
  { label: 'sm', className: 'text-sm' },
  { label: 'base', className: 'text-base' },
  { label: 'lg', className: 'text-lg' },
  { label: 'xl', className: 'text-xl' },
  { label: '2xl', className: 'text-2xl' },
  { label: '3xl', className: 'text-3xl' },
  { label: '4xl', className: 'text-4xl' },
  { label: '5xl', className: 'text-5xl' },
]

export const TYPE_WEIGHTS: TypeSample[] = [
  { label: 'normal', className: 'font-normal' },
  { label: 'medium', className: 'font-medium' },
  { label: 'semibold', className: 'font-semibold' },
  { label: 'bold', className: 'font-bold' },
]

export const RADIUS_TOKENS: { label: string; className: string; cssVar: string; overridden: boolean }[] = [
  { label: 'xs', className: 'rounded-xs', cssVar: '--radius-xs', overridden: false },
  { label: 'sm', className: 'rounded-sm', cssVar: '--radius-sm', overridden: true },
  { label: 'md', className: 'rounded-md', cssVar: '--radius-md', overridden: true },
  { label: 'lg', className: 'rounded-lg', cssVar: '--radius-lg', overridden: true },
  { label: 'xl', className: 'rounded-xl', cssVar: '--radius-xl', overridden: true },
  { label: '2xl', className: 'rounded-2xl', cssVar: '--radius-2xl', overridden: true },
  { label: '3xl', className: 'rounded-3xl', cssVar: '--radius-3xl', overridden: true },
  { label: '4xl', className: 'rounded-4xl', cssVar: '--radius-4xl', overridden: true },
  { label: 'full', className: 'rounded-full', cssVar: '(n/a — calc(infinity), not a token)', overridden: false },
]

export const SHADOW_TOKENS: { label: string; className: string; cssVar: string }[] = [
  { label: '2xs', className: 'shadow-2xs', cssVar: '--shadow-2xs' },
  { label: 'xs', className: 'shadow-xs', cssVar: '--shadow-xs' },
  { label: 'sm', className: 'shadow-sm', cssVar: '--shadow-sm' },
  { label: 'md', className: 'shadow-md', cssVar: '--shadow-md' },
  { label: 'lg', className: 'shadow-lg', cssVar: '--shadow-lg' },
  { label: 'xl', className: 'shadow-xl', cssVar: '--shadow-xl' },
  { label: '2xl', className: 'shadow-2xl', cssVar: '--shadow-2xl' },
  { label: 'inner', className: 'shadow-inner', cssVar: '--shadow-inner' },
]

export const VARIANT_AUDIT_TARGETS = [
  {
    component: 'Button',
    variants: [
      {
        prop: 'variant' as const,
        values: ['primary', 'secondary', 'outline', 'ghost', 'destructive', 'link'],
        defaultValue: 'primary',
      },
      {
        prop: 'size' as const,
        values: ['sm', 'md', 'lg', 'icon'],
        defaultValue: 'md',
      },
    ],
  },
  {
    component: 'Badge',
    variants: [
      {
        prop: 'variant' as const,
        values: ['default', 'secondary', 'outline', 'success', 'warning', 'destructive'],
        defaultValue: 'default',
      },
    ],
  },
]
