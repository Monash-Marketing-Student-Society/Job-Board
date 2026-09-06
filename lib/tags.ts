/**
 * Job Function vocabulary — the closed set of tags a job may carry.
 *
 * This is the single source of truth. Before this module the same nine values
 * existed only as a private `TAG_OPTIONS` array in lib/excel-template.ts, used
 * to build one line of help text and enforced nowhere: every write path
 * (admin job form, public submission form, the /submit/edit PATCH route, the
 * Excel bulk import, and the AI prefill route) accepted arbitrary free text
 * straight into a `TEXT[]` column with no CHECK constraint.
 *
 * Order is carried over verbatim from the real MMSS spreadsheet's data
 * validation list, so the bulk-import instruction text this feeds is unchanged.
 * Nothing depends on the order beyond that — call sites are free to sort for
 * display.
 */
export const JOB_FUNCTIONS = [
  'Strategy',
  'Sales',
  'Creative',
  'Events',
  'Communications',
  'Analytics',
  'Social Media',
  'Digital',
  'Brand',
] as const

export type JobFunction = (typeof JOB_FUNCTIONS)[number]

/**
 * How many functions one job may carry.
 *
 * Enforced in the UI and at the API boundary, deliberately *not* as a database
 * CHECK: membership in the vocabulary is a data-integrity invariant, but a count
 * limit is a product rule, and baking it into the schema turns a change of mind
 * into a migration plus a hard insert failure for anything already stored.
 */
export const MAX_JOB_FUNCTIONS = 3

/** Exact-match guard. Use where a value is already expected to be canonical. */
export function isJobFunction(value: unknown): value is JobFunction {
  return typeof value === 'string' && (JOB_FUNCTIONS as readonly string[]).includes(value)
}

/**
 * Canonicalise one value, or null if it isn't in the vocabulary.
 *
 * Case- and whitespace-insensitive, mirroring `normalizeWorkMode` /
 * `normalizeJobType` in lib/utils.ts. This folds `"social media"` and
 * `" Brand "` onto their canonical spellings — it does **not** alias distinct
 * strings (`"Social"`, `"Marketing"`, `"Comms"` all return null), because
 * guessing intent is how a controlled vocabulary quietly stops being one.
 */
export function toJobFunction(value: unknown): JobFunction | null {
  if (typeof value !== 'string') return null
  const needle = value.trim().toLowerCase()
  return JOB_FUNCTIONS.find((fn) => fn.toLowerCase() === needle) ?? null
}

/**
 * Canonicalise an arbitrary list — the shape every untrusted producer hands us
 * (a parsed spreadsheet column, an AI response, a JSON request body).
 *
 * Unrecognised entries are dropped rather than surfaced; duplicates are removed;
 * the result is capped at `MAX_JOB_FUNCTIONS`. Accepts a comma-separated string
 * as well as an array, since the free-text era stored both.
 */
export function toJobFunctions(value: unknown, max: number = MAX_JOB_FUNCTIONS): JobFunction[] {
  const raw = typeof value === 'string' ? value.split(',') : Array.isArray(value) ? value : []

  const seen: JobFunction[] = []
  for (const entry of raw) {
    const fn = toJobFunction(entry)
    if (fn && !seen.includes(fn)) seen.push(fn)
    if (seen.length >= max) break
  }
  return seen
}
