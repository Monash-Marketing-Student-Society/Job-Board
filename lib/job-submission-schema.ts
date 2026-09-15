import { z } from 'zod'
import { isValidApplicationUrl } from './utils'

/**
 * The shape a public HR submission is allowed to write.
 *
 * `POST /api/submit-job` and `PATCH /api/submit-job/[token]` are both
 * unauthenticated and both write through a service-role client that bypasses
 * RLS, so the request body is the only thing standing between an arbitrary
 * caller and the `job_submissions` row. Before this schema the POST route
 * spread the raw body straight into the insert (`.insert({ ...body })`), which
 * let a caller set `status: 'approved'`, choose their own `edit_token`, or
 * backdate `created_at` — a job goes live the moment an admin approves a row,
 * and approval trusts `status`.
 *
 * This lists only the fields a submitter owns. zod strips unknown keys by
 * default, so `status`, `edit_token`, `admin_note`, `archived_at`, `id` and
 * the timestamps fall away rather than reaching the database — parsing is the
 * allowlist. It is deliberately `.strip()` and not `.strict()`: a future
 * client sending one extra field should not get a 400, and dropping the field
 * closes the hole either way.
 *
 * Length caps are a payload-size and sanity guard, not a schema mirror — the
 * `job_submissions` columns are bare `TEXT` with no length limit of their own.
 * The enum lists mirror the CHECK constraints in
 * supabase/migrations/0004_add_job_submissions.sql and the `WorkMode` /
 * `JobType` unions in lib/types.ts.
 */

const WORK_MODES = ['remote', 'hybrid', 'onsite'] as const
const JOB_TYPES = [
  'internship',
  'graduate',
  'part-time',
  'full-time',
  'casual',
  'contract',
] as const

// Rich-text HTML — still passed through sanitizeDescription() at the call site,
// which is what actually removes script. This cap only bounds the payload.
const DESCRIPTION_MAX = 50_000

const httpUrl = z
  .string()
  .trim()
  .max(2048)
  .url()
  // url() alone accepts javascript:, data:, mailto: and every other scheme.
  // These land in href/src attributes on the public site.
  .refine((u) => /^https?:\/\//i.test(u), 'Must be an http(s) URL')

// The application link: an http(s) URL, or a bare email for employers whose
// applications go straight to an inbox rather than a dedicated posting.
// toApplicationHref() at the call site adds the `mailto:` scheme when this
// is an email — this only validates the raw value the form/DB store.
const applicationUrl = z
  .string()
  .trim()
  .max(2048)
  .refine(isValidApplicationUrl, 'Must be an http(s) URL or an email address')

// Optional free-text: the /submit form sends `null` for anything left blank.
// Treat an empty or whitespace-only string the same way, so a different client
// cannot store `""` where the rest of the app expects `null`.
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((s) => (s ? s : null))

// Optional enum / url / array: accept null or undefined, normalise undefined to
// null so the insert always gets an explicit value.
//
// Also folds a blank/whitespace-only string onto null before validating, the
// same rule optionalText applies to plain text fields. Without this, a
// client sending "" here got a 400 while the identical "empty" intent on
// location/description/summary succeeded — none of these fields (an enum
// member, a URL, an array, an ISO datetime) is ever legitimately "", so
// treating it as "absent" instead of "invalid" is strictly more permissive.
const nullableDefault = <T extends z.ZodTypeAny>(schema: T) =>
  z
    .preprocess((v) => (typeof v === 'string' && v.trim() === '' ? null : v), schema.nullish())
    .transform((v) => v ?? null)

export const jobSubmissionSchema = z.object({
  submitter_name: z.string().trim().min(1).max(200),
  submitter_email: z.string().trim().min(1).max(254).email(),
  submitter_company_name: z.string().trim().min(1).max(200),

  title: z.string().trim().min(1).max(200),
  company: z.string().trim().min(1).max(200),
  url: applicationUrl,

  location: optionalText(200),
  work_mode: nullableDefault(z.enum(WORK_MODES)),
  job_type: z.enum(JOB_TYPES),

  description: optionalText(DESCRIPTION_MAX),
  summary: optionalText(500),
  company_logo_url: nullableDefault(httpUrl),

  // Canonicalised and capped to the vocabulary by toJobFunctions() at the call
  // site; this only checks the outer shape and bounds how much we accept.
  tags: nullableDefault(z.array(z.string().max(100)).max(20)),

  // The form sends `new Date(value).toISOString()`, i.e. a UTC ISO 8601 string.
  closing_at: z.string().datetime({ offset: true }),

  // Submitter opting into a sponsored/pinned placement. A request only: the
  // approval route publishes the job with is_sponsored = false regardless, and
  // an admin decides sponsorship on the live job. Absent (older client) → false.
  is_sponsored: z
    .boolean()
    .nullish()
    .transform((v) => v ?? false),
})

export type JobSubmissionInput = z.infer<typeof jobSubmissionSchema>
