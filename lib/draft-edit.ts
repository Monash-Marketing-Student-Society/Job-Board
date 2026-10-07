import { z } from 'zod'
import { JOB_TYPES, WORK_MODES, jobSubmissionSchema, nullableDefault } from './job-submission-schema'
import { sanitizeDescription } from './sanitize'
import { toJobFunctions, type JobFunction } from './tags'
import type { JobType, WorkMode } from './types'

/**
 * What an admin may change on a job before approving it, from the preview
 * page of either queue: an HR submission (job_submissions) or a synced job
 * held for review (staged_jobs.normalised).
 *
 * Built from the public submission schema's own field rules, so an admin edit
 * can't store anything a submitter couldn't. Two differences: job type may be
 * left unset (synced jobs often arrive without one), and the closing date may
 * be null (the same as a synced job with none).
 */
export const draftEditSchema = jobSubmissionSchema
  .pick({ title: true, company: true, url: true, location: true, description: true, summary: true, tags: true })
  .extend({
    work_mode: nullableDefault(z.enum(WORK_MODES)),
    job_type: nullableDefault(z.enum(JOB_TYPES)),
    closing_at: nullableDefault(z.string().datetime({ offset: true })),
  })

export interface DraftEdit {
  title: string
  company: string
  url: string
  location: string | null
  work_mode: WorkMode | null
  job_type: JobType | null
  description: string | null
  summary: string | null
  tags: JobFunction[]
  closing_at: string | null
}

export type DraftEditResult = { ok: true; edit: DraftEdit } | { ok: false; error: string }

/**
 * A request body as a clean edit: unknown keys dropped, description
 * sanitised, tags folded onto the fixed vocabulary. The first problem is
 * named, in words an admin can act on.
 */
export function parseDraftEdit(body: unknown): DraftEditResult {
  const parsed = draftEditSchema.safeParse(body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const field = issue?.path.join('.') || 'body'
    return { ok: false, error: `${field}: ${issue?.message ?? 'invalid'}` }
  }
  const d = parsed.data
  return {
    ok: true,
    edit: {
      title: d.title,
      company: d.company,
      url: d.url,
      location: d.location,
      work_mode: d.work_mode,
      job_type: d.job_type,
      description: sanitizeDescription(d.description) || null,
      summary: d.summary,
      tags: toJobFunctions(d.tags ?? []),
      closing_at: d.closing_at,
    },
  }
}
