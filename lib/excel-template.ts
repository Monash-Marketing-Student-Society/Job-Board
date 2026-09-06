import * as XLSX from 'xlsx'

import { JOB_FUNCTIONS } from '@/lib/tags'

/**
 * Matches the real uploaded template exactly (verified byte-for-byte against
 * a live file on chore/deprecate-is-featured): single "Job Data" sheet, this
 * column order, clean headers with no trailing spaces. No Featured column —
 * Sponsored is the 12th and last.
 */
const HEADERS = [
  'TITLE',
  'COMPANY',
  'APPLICATION URL',
  'LOCATION',
  'WORK-MODE',
  'JOB TYPE',
  'DESCRIPTION',
  'TAGS',
  'COMPANY LOGO URL',
  'POST DATE',
  'CLOSE DATE',
  'SPONSORED',
]

/**
 * The one thing that actually has to identify row 2 as the sample —
 * bulk-import.tsx imports this same constant and skips any row whose Title
 * cell matches it exactly. Grey fill + italic would be nice too, but the
 * installed `xlsx` package (SheetJS Community Edition) doesn't support
 * writing cell styles — confirmed by inspecting its source, not assumed —
 * so the text marker is carrying the whole job, not just the human-readable
 * half of it.
 */
export const SAMPLE_ROW_TITLE = 'SAMPLE — delete this row before importing'

const SAMPLE_ROW = [
  SAMPLE_ROW_TITLE,
  'Acme Corp',
  'https://acme.com/apply',
  'Melbourne, VIC',
  'hybrid',
  'internship',
  'Join our marketing team for an exciting internship opportunity.',
  'Strategy',
  'https://acme.com/logo.png',
  '2026-03-15',
  '2026-04-30',
  'no',
]

/**
 * Rows 3 through this stay blank for real data entry. Nothing is written
 * into them (no dragged-down values, unlike the old Featured/Sponsored
 * "False" filler) — they simply don't exist in the sheet's cell map, which
 * XLSX and this app's parser both already treat as blank. This is also the
 * range the Tags dropdown validation would cover (H2:H{DATA_LAST_ROW}) if
 * this library could write one.
 */
const DATA_LAST_ROW = 501

/**
 * Instructions live well below the data (not above the header — the parser
 * and every row-layout assumption in this file depend on row 1 being the
 * header, so moving instructions above it would mean teaching the parser to
 * hunt for the header row instead of trusting position 0), starting a
 * comfortable gap past DATA_LAST_ROW so no realistic import ever reaches
 * it. Written into column B, not A — Title (column A) stays blank on every
 * instruction row, so the parser's title-presence skip excludes this block
 * the same way it already excludes filler rows, with no special-casing.
 * Exactly the convention the real uploaded template already used
 * (instruction text in column N there) — same mechanism, different column.
 */
const INSTRUCTIONS_START_ROW = DATA_LAST_ROW + 5

const INSTRUCTIONS: string[] = [
  'INSTRUCTIONS',
  '1. Each row = one job posting. Row 2 is a sample — delete it before uploading, or leave it: it is skipped automatically.',
  '2. Required columns: Title, Company, Application URL. Everything else is optional.',
  `3. Tags (column H): one tag per row, no dropdown in this file — pick one of: ${JOB_FUNCTIONS.join(', ')}.`,
  '4. Post Date and Close Date use YYYY-MM-DD format.',
  '5. Save the file and upload it back on the admin page.',
]

export function generateTemplate(): ArrayBuffer {
  const wb = XLSX.utils.book_new()

  const ws = XLSX.utils.aoa_to_sheet([HEADERS, SAMPLE_ROW])

  // Placed by absolute cell address rather than materializing ~500 blank
  // array rows in between — XLSX and the parser both read an absent cell
  // the same as an explicitly blank one.
  XLSX.utils.sheet_add_aoa(
    ws,
    INSTRUCTIONS.map((line) => ['', line]),
    { origin: `A${INSTRUCTIONS_START_ROW}` }
  )

  ws['!cols'] = HEADERS.map((h) => ({ wch: Math.max(h.length + 4, 18) }))

  XLSX.utils.book_append_sheet(wb, ws, 'Job Data')

  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
}
