'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Workbook, type CellValue, type Worksheet } from 'exceljs'
import { Button, Alert, AlertDescription } from '@/components/ui'
import { createClient } from '@/lib/supabase/client'
import { generateTemplate, SAMPLE_ROW_TITLE } from '@/lib/excel-template'
import {
  JOB_FUNCTIONS,
  MAX_JOB_FUNCTIONS,
  toJobFunction,
  toJobFunctions,
} from '@/lib/tags'
import type { JobInsert, WorkMode, JobType } from '@/lib/types'

const VALID_WORK_MODES = ['remote', 'hybrid', 'onsite']
const VALID_JOB_TYPES = ['internship', 'graduate', 'part-time', 'full-time', 'casual', 'contract']

interface ParsedRow {
  rowNum: number
  data: JobInsert
  warnings: string[]
}

interface ParseError {
  rowNum: number
  message: string
}

function parseYesNo(val: unknown, defaultVal: boolean): boolean {
  if (val === undefined || val === null || val === '') return defaultVal
  const str = String(val).trim().toLowerCase()
  return str === 'yes' || str === 'true' || str === '1'
}

// Excel's serial-date epoch is 1899-12-30 (not 1900-01-01 — the offset bakes
// in Excel's historical, deliberately-preserved leap-year bug). Only reached
// when a cell holds a bare number exceljs didn't recognise as a date itself
// (see cellToRaw below); a cell exceljs does recognise comes through as a
// Date already, same as it would have with xlsx's cellDates: true.
function excelSerialToDate(serial: number): Date | null {
  const ms = Math.round((serial - 25569) * 86400 * 1000)
  const date = new Date(ms)
  return isNaN(date.getTime()) ? null : date
}

function parseDate(val: unknown): string | null {
  if (val === undefined || val === null || val === '') return null
  if (val instanceof Date) return val.toISOString()
  if (typeof val === 'number') {
    const date = excelSerialToDate(val)
    return date ? date.toISOString() : null
  }
  const str = String(val).trim()
  const parsed = new Date(str)
  if (isNaN(parsed.getTime())) return null
  return parsed.toISOString()
}

/**
 * exceljs hands back plain values (string/number/Date) for ordinary cells,
 * but rich text, hyperlinks and formulas each come through as a small object
 * instead. Unwrap those to the value the rest of this file already expects —
 * xlsx's sheet_to_json flattened all of these to plain values, so without
 * this a hyperlinked or formula-driven Application URL cell would parse as
 * "[object Object]".
 */
function cellToRaw(value: CellValue): unknown {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value
  if (typeof value === 'object') {
    if ('richText' in value) return value.richText.map((r) => r.text).join('')
    if ('result' in value) return value.result ?? ''
    if ('text' in value) return value.text
  }
  return value
}

/**
 * Named-sheet lookup, not a fixed position. The real uploaded template
 * (verified directly, not assumed) has exactly one sheet, "Job Data" — the
 * old `SheetNames[1]` position-based lookup expected a 2nd sheet that
 * doesn't exist there and failed on every upload of that file. Falls back
 * to "the only sheet in the workbook" when nothing matches by name, so a
 * user's own single-sheet export still works even if they've renamed the
 * tab; anything else (no name match, more than one sheet) is treated as
 * not this template at all rather than guessed at.
 */
function findJobDataSheet(wb: Workbook): Worksheet | null {
  const byName = wb.worksheets.find((ws) => ws.name.trim().toLowerCase() === 'job data')
  if (byName) return byName
  if (wb.worksheets.length === 1) return wb.worksheets[0]
  return null
}

async function parseExcelRows(data: ArrayBuffer): Promise<{ rows: ParsedRow[]; errors: ParseError[] }> {
  const wb = new Workbook()
  await wb.xlsx.load(data)

  const ws = findJobDataSheet(wb)
  if (!ws) {
    return { rows: [], errors: [{ rowNum: 0, message: 'Could not find a "Job Data" sheet. Please download a fresh template and try again.' }] }
  }

  if (ws.rowCount < 2) {
    return { rows: [], errors: [{ rowNum: 0, message: 'No data rows found in the "Job Data" sheet.' }] }
  }

  // Row 1 is the header, never read for its text — every column below is
  // positional (col 1, col 2, ...), so header names, trimmed or not, have no
  // code path to affect. Nothing to change here; see the report for why this
  // instruction has no matching call site.
  const rows: ParsedRow[] = []
  const errors: ParseError[] = []

  for (let rowNum = 2; rowNum <= ws.rowCount; rowNum++) {
    const row = ws.getRow(rowNum)
    const cell = (col: number) => cellToRaw(row.getCell(col).value)

    // Skip template filler rows (no Title) and the template's own sample
    // row (exact match on the Title text generateTemplate wrote into it —
    // SAMPLE_ROW_TITLE, shared from lib/excel-template so the two can't
    // drift apart).
    const title = String(cell(1) ?? '').trim()
    if (!title || title === SAMPLE_ROW_TITLE) continue

    const company = String(cell(2) ?? '').trim()
    const url = String(cell(3) ?? '').trim()

    // Validate required fields
    const missing: string[] = []
    if (!company) missing.push('Company')
    if (!url) missing.push('Application URL')

    if (missing.length > 0) {
      errors.push({ rowNum, message: `Missing required fields: ${missing.join(', ')}` })
      continue
    }

    const warnings: string[] = []

    // Parse optional fields
    const location = String(cell(4) ?? '').trim() || null
    const workModeRaw = String(cell(5) ?? '').trim().toLowerCase()
    const jobTypeRaw = String(cell(6) ?? '').trim().toLowerCase()
    const description = String(cell(7) ?? '').trim() || null
    const tagsRaw = String(cell(8) ?? '').trim()
    const logoUrl = String(cell(9) ?? '').trim() || null
    const postedAt = parseDate(cell(10))
    const closingAt = parseDate(cell(11))
    const isSponsored = parseYesNo(cell(12), false)
    // Nothing at column 13+ is a real column any more — the template ends at
    // Sponsored (12). is_active isn't user-set on import; it takes the same
    // default new jobs get everywhere else (omitted here, DB DEFAULT TRUE).

    let workMode: WorkMode | null = null
    if (workModeRaw && VALID_WORK_MODES.includes(workModeRaw)) {
      workMode = workModeRaw as WorkMode
    } else if (workModeRaw) {
      warnings.push(`Invalid work mode "${workModeRaw}" — ignored`)
    }

    let jobType: JobType | null = null
    if (jobTypeRaw && VALID_JOB_TYPES.includes(jobTypeRaw)) {
      jobType = jobTypeRaw as JobType
    } else if (jobTypeRaw) {
      warnings.push(`Invalid job type "${jobTypeRaw}" — ignored`)
    }

    // Tags are a fixed vocabulary (lib/tags.ts). Anything outside it is named
    // in a warning and dropped, matching how work mode and job type above
    // report a bad value rather than silently writing whatever was typed.
    // The template's own instruction sheet lists the accepted values.
    const tagsGiven = tagsRaw
      ? tagsRaw.split(',').map((t) => t.trim()).filter(Boolean)
      : []
    const validTags = toJobFunctions(tagsRaw, JOB_FUNCTIONS.length)
    const rejectedTags = tagsGiven.filter((t) => toJobFunction(t) === null)

    if (rejectedTags.length > 0) {
      warnings.push(
        `Invalid tag${rejectedTags.length > 1 ? 's' : ''} ${rejectedTags
          .map((t) => `"${t}"`)
          .join(', ')} — ignored`
      )
    }

    const tags = validTags.slice(0, MAX_JOB_FUNCTIONS)
    if (validTags.length > MAX_JOB_FUNCTIONS) {
      warnings.push(
        `More than ${MAX_JOB_FUNCTIONS} tags — kept ${tags.join(', ')}`
      )
    }

    if (cell(10) && !postedAt) warnings.push('Could not parse posted date')
    if (cell(11) && !closingAt) warnings.push('Could not parse closing date')

    rows.push({
      rowNum,
      warnings,
      data: {
        title,
        company,
        url,
        location,
        work_mode: workMode,
        job_type: jobType,
        description,
        tags: tags.length > 0 ? tags : null,
        company_logo_url: logoUrl,
        posted_at: postedAt,
        closing_at: closingAt,
        is_sponsored: isSponsored,
        source: 'manual',
      },
    })
  }

  return { rows, errors }
}

export function BulkImport() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [preview, setPreview] = useState<ParsedRow[] | null>(null)
  const [parseErrors, setParseErrors] = useState<ParseError[]>([])
  const [importResult, setImportResult] = useState<{ success: number; failed: number } | null>(null)
  const [error, setError] = useState('')

  const handleDownloadTemplate = async () => {
    setError('')
    try {
      const buffer = await generateTemplate()
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'mmss-job-board-import-template.xlsx'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError('Failed to generate the template file.')
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setError('')
    setImportResult(null)
    setPreview(null)
    setParseErrors([])

    try {
      const buffer = await file.arrayBuffer()
      const { rows, errors } = await parseExcelRows(buffer)

      setParseErrors(errors)

      if (rows.length === 0 && errors.length === 0) {
        setError('No valid job rows found in the spreadsheet.')
        return
      }

      setPreview(rows)
    } catch {
      setError('Failed to read the file. Make sure it is a valid .xlsx file.')
    }

    // Reset file input so the same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleImport = async () => {
    if (!preview || preview.length === 0) return

    setIsUploading(true)
    setError('')

    try {
      const supabase = createClient()
      let success = 0
      let failed = 0

      // Insert in batches of 20
      const batchSize = 20
      for (let i = 0; i < preview.length; i += batchSize) {
        const batch = preview.slice(i, i + batchSize).map((r) => r.data)
        const { error: insertError } = await supabase
          .from('jobs')
          .insert(batch)

        if (insertError) {
          // If batch fails, try one-by-one
          for (const job of batch) {
            const { error: singleError } = await supabase
              .from('jobs')
              .insert(job)

            if (singleError) {
              failed++
            } else {
              success++
            }
          }
        } else {
          success += batch.length
        }
      }

      setImportResult({ success, failed })
      setPreview(null)

      if (success > 0) {
        router.refresh()
      }
    } catch {
      setError('An unexpected error occurred during import.')
    } finally {
      setIsUploading(false)
    }
  }

  const handleCancel = () => {
    setPreview(null)
    setParseErrors([])
    setError('')
    setImportResult(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" onClick={handleDownloadTemplate}>
          Download Template
        </Button>
        <label className="cursor-pointer">
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
          >
            Upload Excel File
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileSelect}
            className="hidden"
          />
        </label>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {importResult && (
        <Alert variant={importResult.failed === 0 ? 'success' : 'destructive'}>
          <AlertDescription>
            Import complete: {importResult.success} job{importResult.success !== 1 ? 's' : ''} created
            {importResult.failed > 0 && `, ${importResult.failed} failed`}.
          </AlertDescription>
        </Alert>
      )}

      {parseErrors.length > 0 && (
        <Alert variant="destructive">
          <AlertDescription>
            <p className="font-medium mb-1">Errors found:</p>
            <ul className="list-disc pl-5 space-y-0.5 text-sm">
              {parseErrors.map((err, i) => (
                <li key={i}>
                  {err.rowNum > 0 ? `Row ${err.rowNum}: ` : ''}{err.message}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {preview && preview.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">
              {preview.length} job{preview.length !== 1 ? 's' : ''} ready to import
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleCancel}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleImport}
                loading={isUploading}
              >
                Import {preview.length} Job{preview.length !== 1 ? 's' : ''}
              </Button>
            </div>
          </div>

          <div className="rounded-lg border bg-background overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Row</th>
                    <th className="px-3 py-2 text-left font-medium">Title</th>
                    <th className="px-3 py-2 text-left font-medium">Company</th>
                    <th className="px-3 py-2 text-left font-medium">Type</th>
                    <th className="px-3 py-2 text-left font-medium">Location</th>
                    <th className="px-3 py-2 text-left font-medium">Warnings</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {preview.map((row) => (
                    <tr key={row.rowNum}>
                      <td className="px-3 py-2 text-muted-foreground">{row.rowNum}</td>
                      <td className="px-3 py-2 font-medium">{row.data.title}</td>
                      <td className="px-3 py-2">{row.data.company}</td>
                      <td className="px-3 py-2">{row.data.job_type || '—'}</td>
                      <td className="px-3 py-2">{row.data.location || '—'}</td>
                      <td className="px-3 py-2 text-amber-600">
                        {row.warnings.length > 0 ? row.warnings.join('; ') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
