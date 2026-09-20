/**
 * Types for, and a typed accessor over, the audit snapshot written by
 * scripts/audit-style-usage.mjs to style-audit.generated.json.
 *
 * This file used to walk app/, components/, and lib/ itself on every
 * request (the page carried `export const dynamic = 'force-dynamic'` so it
 * would never serve a stale snapshot). That meant a full fs walk on every
 * hit of an admin-only reference page. The walk now happens once, in the
 * script — this just imports its committed output and types it. Run
 * `npm run audit:style` to refresh the numbers; see the script for the scan
 * logic itself.
 */

import rawSnapshot from './style-audit.generated.json'

export interface RawPaletteFileReport {
  file: string
  classes: { className: string; count: number }[]
  total: number
}

export interface RawPaletteReport {
  files: RawPaletteFileReport[]
  totalInstances: number
  totalFiles: number
  byFamily: { family: string; count: number }[]
}

export interface VariantUsageReport {
  component: string
  prop: 'variant' | 'size'
  values: { value: string; count: number; isDefault: boolean }[]
}

export interface BorderAxisReport {
  axis: string
  label: string
  values: { className: string; count: number }[]
  distinct: number
  total: number
}

export interface BorderUsageReport {
  axes: BorderAxisReport[]
}

export interface RouteUsageReport {
  files: { file: string; routes: string[] }[]
  allRoutes: string[]
}

export interface StyleAuditSnapshot {
  generatedAt: string
  rawPalette: RawPaletteReport
  variantUsage: VariantUsageReport[]
  borderUsage: BorderUsageReport
  routeUsage: RouteUsageReport
}

export const styleAudit = rawSnapshot as StyleAuditSnapshot
