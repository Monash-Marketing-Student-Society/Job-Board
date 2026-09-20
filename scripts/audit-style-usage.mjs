#!/usr/bin/env node
/**
 * Generates the source audit shown on the /admin/style reference page.
 *
 * Walks app/, components/, and lib/ and writes a JSON snapshot to
 * app/admin/style/lib/style-audit.generated.json, covering:
 *   - raw Tailwind palette usage (slate-*, zinc-*, red-*, ...) — section 2
 *     of the page, and the actual point of it: every hit is a place the
 *     semantic token layer in app/globals.css is being bypassed.
 *   - variant/size usage for the components documented in section 6, so
 *     the page can flag a variant nothing in the app reaches for.
 *   - border/radius usage per axis (colour, width, radius, ring) — section 8,
 *     which asks how many distinct values each axis of a bordered surface
 *     currently holds.
 *
 * Run `npm run audit:style` to refresh the snapshot by hand, or `npm run
 * build`, which runs it as `prebuild`. The page reads the committed JSON
 * rather than re-walking the source tree on every request — for an
 * admin-only reference page that's the right trade: nobody needs these
 * counts live mid-session, and it means /admin/style doesn't cost a full
 * fs walk per hit. Re-run after adding/removing raw-palette classes or
 * Button/Badge call sites you want reflected here.
 */

import { readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..')
const OUTPUT_FILE = path.join(PROJECT_ROOT, 'app/admin/style/lib/style-audit.generated.json')

const SCAN_ROOTS = ['app', 'components', 'lib']
const SKIP_DIR_NAMES = new Set(['node_modules', '.next', '.git'])
// This page's own route — excluded so the audit reports on the app it
// documents, not on itself (its dashed "gap" note box, etc.).
const SKIP_PATH = path.join('app', 'admin', 'style')
const FILE_EXTENSIONS = new Set(['.ts', '.tsx'])

// Tailwind's raw palette families. Anything in this list bypasses the
// semantic token layer defined in app/globals.css.
const RAW_PALETTE_FAMILIES = [
  'slate', 'zinc', 'neutral', 'stone', 'gray',
  'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal',
  'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose',
]

const RAW_CLASS_RE = new RegExp(
  `\\b(bg|text|border|from|to|via|ring|fill|stroke|divide|outline|decoration|shadow|accent|caret)-(${RAW_PALETTE_FAMILIES.join('|')})-([0-9]{2,3})\\b`,
  'g'
)

/**
 * Border/radius usage, for section 8 ("Borders"). Section 2 already catches
 * the raw-palette half of this (`border-slate-200` is a slate hit), but the
 * question section 8 asks is a different one: across every axis that makes
 * up a bordered surface — colour, width, corner radius, and whether the edge
 * is drawn with `border` or `ring` at all — how many distinct values are in
 * play? A single value per axis is the goal; the counts below are what says
 * how far off that is. Buckets are deliberately coarse: the page compares
 * whole treatments, not individual utilities.
 */
const BORDER_AXES = [
  {
    axis: 'color',
    label: 'Border colour',
    re: /(?<![\w-])border-(?:border|border-light|input|ring|primary|secondary|muted|accent|transparent|current|foreground|success|warning|destructive|card|popover|sidebar(?:-border)?|(?:slate|zinc|neutral|stone|gray|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]{2,3}|\[[^\]\s]+\])(?:\/\d{1,3})?(?![\w-])/g,
  },
  {
    // Bare `border` (Tailwind's 1px default) counts here too — it is the
    // width the app mostly uses, so a list without it makes the two dozen
    // explicit widths look like the whole story.
    axis: 'width',
    label: 'Border width',
    re: /(?<![\w-])border(?:-[xytrbles])?(?:-(?:0|2|4|8|\[[0-9.]+px\]))?(?![\w-])/g,
  },
  {
    axis: 'radius',
    label: 'Corner radius',
    re: /(?<![\w-])rounded(?:-[trbl]{1,2})?(?:-(?:none|xs|sm|md|lg|xl|2xl|3xl|4xl|full|\[[^\]\s]+\]))?(?![\w-])/g,
  },
  {
    axis: 'method',
    label: 'Edge drawn with',
    re: /(?<![\w-])ring-(?:0|[1-9]|\[[0-9.]+px\])(?![\w-])/g,
  },
]

// Component/variant registry for the usage audit. Kept in sync by hand with
// VARIANT_AUDIT_TARGETS in app/admin/style/lib/tokens.ts — this script runs
// as plain Node outside the Next/TS toolchain, so it can't import a .ts
// module directly, and duplicating a two-entry list is simpler than adding
// a build step just to share it.
const VARIANT_AUDIT_TARGETS = [
  {
    component: 'Button',
    variants: [
      { prop: 'variant', values: ['primary', 'secondary', 'outline', 'ghost', 'destructive', 'link'], defaultValue: 'primary' },
      { prop: 'size', values: ['sm', 'md', 'lg', 'icon'], defaultValue: 'md' },
    ],
  },
  {
    component: 'Badge',
    variants: [
      { prop: 'variant', values: ['default', 'secondary', 'outline', 'success', 'warning', 'destructive'], defaultValue: 'default' },
    ],
  },
]

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    const rel = path.relative(PROJECT_ROOT, full)

    if (rel === SKIP_PATH || rel.startsWith(SKIP_PATH + path.sep)) continue

    if (entry.isDirectory()) {
      if (SKIP_DIR_NAMES.has(entry.name)) continue
      files.push(...(await walk(full)))
    } else if (FILE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(full)
    }
  }

  return files
}

async function scanRawPaletteUsage(allFiles) {
  const files = []
  const familyCounts = new Map()
  let totalInstances = 0

  for (const filePath of [...allFiles].sort()) {
    const source = await readFile(filePath, 'utf-8')
    const counts = new Map()
    let match
    RAW_CLASS_RE.lastIndex = 0

    while ((match = RAW_CLASS_RE.exec(source))) {
      const className = match[0]
      const family = match[2]
      counts.set(className, (counts.get(className) ?? 0) + 1)
      familyCounts.set(family, (familyCounts.get(family) ?? 0) + 1)
      totalInstances += 1
    }

    if (counts.size > 0) {
      const classes = [...counts.entries()]
        .map(([className, count]) => ({ className, count }))
        .sort((a, b) => b.count - a.count)
      const total = classes.reduce((sum, c) => sum + c.count, 0)
      files.push({ file: path.relative(PROJECT_ROOT, filePath), classes, total })
    }
  }

  files.sort((a, b) => b.total - a.total)

  const byFamily = [...familyCounts.entries()]
    .map(([family, count]) => ({ family, count }))
    .sort((a, b) => b.count - a.count)

  return { files, totalInstances, totalFiles: files.length, byFamily }
}

async function scanBorderUsage(allFiles) {
  const sources = await Promise.all(allFiles.map((f) => readFile(f, 'utf-8')))
  const axes = []

  for (const { axis, label, re } of BORDER_AXES) {
    const counts = new Map()

    for (const source of sources) {
      re.lastIndex = 0
      let match
      while ((match = re.exec(source))) {
        counts.set(match[0], (counts.get(match[0]) ?? 0) + 1)
      }
    }

    const values = [...counts.entries()]
      .map(([className, count]) => ({ className, count }))
      .sort((a, b) => b.count - a.count || a.className.localeCompare(b.className))

    axes.push({
      axis,
      label,
      values,
      distinct: values.length,
      total: values.reduce((sum, v) => sum + v.count, 0),
    })
  }

  return { axes }
}


/**
 * Route provenance — which live routes actually reach a given source file.
 *
 * Asked naively ("which files mention <Badge>") this produces a list of
 * components, which is not the question: nobody visits components/ui. The
 * question the style pages ask is "where on the site does this show up",
 * and answering it means walking the import graph out from each route's
 * page.tsx (plus the layouts that wrap it) until it closes.
 *
 * Resolution covers the two import forms this repo uses — the `@/` alias
 * and relative paths — against .ts/.tsx, with /index fallback. Anything
 * else (bare package imports) is a dependency, not app code, and is
 * skipped. Dynamic imports and any path built at runtime are invisible
 * here, so this undercounts rather than inventing a route.
 */
const ROUTE_ENTRY_FILES = ['page.tsx', 'layout.tsx']

function routeFromFile(relPath) {
  const dir = path.dirname(relPath)
  const segments = dir.split(path.sep).slice(1) // drop leading "app"
  // Route groups — (marketing) — are organisational, not URL segments.
  const url = segments.filter((seg) => !(seg.startsWith('(') && seg.endsWith(')')))
  return '/' + url.join('/')
}

async function resolveImport(spec, fromFile) {
  let base
  if (spec.startsWith('@/')) base = path.join(PROJECT_ROOT, spec.slice(2))
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(fromFile), spec)
  else return null

  const candidates = [
    base + '.tsx',
    base + '.ts',
    path.join(base, 'index.tsx'),
    path.join(base, 'index.ts'),
  ]
  for (const candidate of candidates) {
    try {
      await readFile(candidate, 'utf-8')
      return candidate
    } catch {
      // Not this extension; try the next.
    }
  }
  return null
}

const IMPORT_RE = /(?:^|\n)\s*(?:import|export)[^'"\n]*?from\s*['"]([^'"]+)['"]/g

async function filesReachedFrom(entryFile, cache) {
  const seen = new Set()
  const queue = [entryFile]

  while (queue.length) {
    const current = queue.pop()
    if (seen.has(current)) continue
    seen.add(current)

    let source = cache.get(current)
    if (source === undefined) {
      try {
        source = await readFile(current, 'utf-8')
      } catch {
        source = ''
      }
      cache.set(current, source)
    }

    IMPORT_RE.lastIndex = 0
    let match
    const specs = []
    while ((match = IMPORT_RE.exec(source))) specs.push(match[1])

    for (const spec of specs) {
      const resolved = await resolveImport(spec, current)
      if (resolved && !seen.has(resolved)) queue.push(resolved)
    }
  }

  return seen
}

async function scanRouteProvenance(allFiles) {
  const appDir = path.join(PROJECT_ROOT, 'app')
  const entries = allFiles.filter(
    (f) => f.startsWith(appDir + path.sep) && ROUTE_ENTRY_FILES.includes(path.basename(f))
  )

  // A layout wraps every route beneath it, so its imports belong to all of
  // them — otherwise the header and nav components look route-less.
  const pages = entries.filter((f) => path.basename(f) === 'page.tsx')
  const layouts = entries.filter((f) => path.basename(f) === 'layout.tsx')
  const cache = new Map()
  const byFile = new Map()

  for (const page of pages) {
    const rel = path.relative(PROJECT_ROOT, page)
    const route = routeFromFile(rel)
    if (route.startsWith('/admin/style')) continue // the style pages, not the app

    const pageDir = path.dirname(page)
    const applicable = [
      page,
      ...layouts.filter((l) => pageDir.startsWith(path.dirname(l) + path.sep) || path.dirname(l) === pageDir),
    ]

    const reached = new Set()
    for (const entry of applicable) {
      for (const f of await filesReachedFrom(entry, cache)) reached.add(f)
    }

    for (const f of reached) {
      const relFile = path.relative(PROJECT_ROOT, f)
      if (relFile.startsWith('app' + path.sep + 'admin' + path.sep + 'style')) continue
      if (!byFile.has(relFile)) byFile.set(relFile, new Set())
      byFile.get(relFile).add(route)
    }
  }

  const files = [...byFile.entries()]
    .map(([file, routes]) => ({
      file,
      routes: [...routes].sort(),
    }))
    .sort((a, b) => a.file.localeCompare(b.file))

  const allRoutes = [...new Set(files.flatMap((f) => f.routes))].sort()

  return { files, allRoutes }
}

// Best-effort JSX scan: finds `<ComponentName ...>` opening tags and reads a
// `variant="x"` (or size="x") attribute out of the tag's attribute text. It
// does not parse JSX into an AST, so a variant built from a runtime
// expression (`variant={isError ? 'destructive' : 'primary'}`) won't be
// picked up — those undercount rather than false-flag as "unused". Good
// enough for a reference page whose job is to flag the obvious case: a
// variant nothing reaches for.
function extractAttrValues(source, componentName, attr) {
  const tagRe = new RegExp(`<${componentName}(?=[\\s/>])([^>]*)>`, 'gs')
  const found = []
  let m

  while ((m = tagRe.exec(source))) {
    const attrs = m[1]
    const valMatch = new RegExp(`${attr}=(?:\\{?["'\`])([\\w-]+)(?:["'\`]\\}?)`).exec(attrs)
    found.push(valMatch ? valMatch[1] : '__default__')
  }

  return found
}

async function scanVariantUsage(allFiles) {
  const sources = await Promise.all(allFiles.map((f) => readFile(f, 'utf-8')))
  const reports = []

  for (const { component, variants } of VARIANT_AUDIT_TARGETS) {
    for (const { prop, values, defaultValue } of variants) {
      const counts = new Map(values.map((v) => [v, 0]))

      for (const source of sources) {
        for (const found of extractAttrValues(source, component, prop)) {
          const resolved = found === '__default__' ? defaultValue : found
          if (counts.has(resolved)) counts.set(resolved, (counts.get(resolved) ?? 0) + 1)
        }
      }

      reports.push({
        component,
        prop,
        values: values.map((value) => ({
          value,
          count: counts.get(value) ?? 0,
          isDefault: value === defaultValue,
        })),
      })
    }
  }

  return reports
}

async function main() {
  const allFiles = []
  for (const root of SCAN_ROOTS) {
    allFiles.push(...(await walk(path.join(PROJECT_ROOT, root))))
  }

  const [rawPalette, variantUsage, borderUsage] = await Promise.all([
    scanRawPaletteUsage(allFiles),
    scanVariantUsage(allFiles),
    scanBorderUsage(allFiles),
  ])
  const routeUsage = await scanRouteProvenance(allFiles)

  const snapshot = {
    generatedAt: new Date().toISOString(),
    rawPalette,
    variantUsage,
    borderUsage,
    routeUsage,
  }

  await writeFile(OUTPUT_FILE, JSON.stringify(snapshot, null, 2) + '\n', 'utf-8')
  console.log(
    `Wrote ${path.relative(PROJECT_ROOT, OUTPUT_FILE)} — ${rawPalette.totalInstances} raw palette instances across ${rawPalette.totalFiles} files.`
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
