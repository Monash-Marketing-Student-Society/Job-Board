/**
 * Control geometry and fills for the admin tables (Jobs, Submissions).
 *
 * Everything here is taken from the status tabs in
 * components/ui/segmented-tabs.tsx — the one control on these pages that
 * already looked right: a soft slate-100 track, a white chip for the active
 * item, no outline. The tables' search, buttons, header and pagination all
 * take that same material and shape, so the card reads as one component
 * instead of stacked strips split by divider lines.
 *
 * Under this theme's --radius scale (app/globals.css) rounded-xl is 18px and
 * rounded-lg is 14px, so:
 *   track level — 40px tall, 18px radius (the tab track)
 *   chip level  — 32px tall, 14px radius (a tab chip)
 * Height and radius travel together on purpose. At h-9 the same 18px radius
 * is half the height, and a control renders as a full pill beside the
 * soft-cornered track.
 *
 * Scoped to admin: nothing public imports this file.
 */

/** 40px / 18px — the tab track. Search, toolbar buttons, header row. */
export const TRACK_SHAPE = 'h-10 rounded-xl'

/** 32px / 14px — a tab chip. Row icon buttons, pagination pages. */
export const CHIP_SHAPE = 'size-8 rounded-lg'

/** Card chrome around a whole admin table. Padding instead of edge-to-edge
 *  strips, so rows and the header can carry their own rounded fills. */
export const tableCardClassName = 'rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200/60 sm:p-4'

/** A secondary toolbar action on the tabs' fill, with no outline. */
export const softButtonClassName =
  'h-10 gap-1.5 rounded-xl bg-slate-100 px-4 text-slate-700 hover:bg-slate-200/70 hover:text-slate-900'

/**
 * Row and select-all checkboxes. The explicit focus ring replaces the global
 * `*:focus-visible` one (grey ring-2 with a 2px offset), which boxed a 14px
 * checkbox in a thick square once it had focus.
 */
export const checkboxClassName =
  'size-3.5 rounded accent-primary focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-0'

/** Small uppercase column labels in the header row. */
export const headerLabelClassName = 'text-[11px] font-semibold uppercase tracking-wide text-slate-500'
