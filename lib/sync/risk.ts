/**
 * Why a synced job is held for review instead of publishing unattended.
 *
 * Straight from the PRD's "What is held for review" list. A tier-A job
 * publishes on its own only when this returns an empty array -- any single
 * reason holds it, and every reason is stored on staged_jobs.risk_reasons so
 * the admin queue can render each as a chip and the digest can say why.
 *
 * Pure: takes what the pipeline already knows, decides nothing about the
 * database. The 'new_adapter' and 'review_only_mode' inputs are supplied by
 * the runner (it counts a source's published jobs and reads its config).
 */

import { isJobSpecificUrl } from './link'
import type { NormalisedJob, NormaliseConfidence } from './normalise'
import type { TargetVerdict } from './target'

export type RiskReason =
  | 'tier_b_or_c'
  | 'missing_title'
  | 'missing_company'
  | 'no_direct_link'
  | 'missing_job_type'
  | 'missing_closing_date'
  | 'inferred_closing_date'
  | 'inferred_location'
  | 'inferred_job_type'
  | 'classifier_unsure'
  | 'new_adapter'
  | 'review_only_mode'
  | 'admin_restored'

/**
 * Human wording for each reason -- shared by the admin queue's chips and the
 * run digest, so the two can't describe the same hold differently.
 */
export const RISK_REASON_LABELS: Record<RiskReason, string> = {
  tier_b_or_c: 'From a job board',
  missing_title: 'No title',
  missing_company: 'No company',
  no_direct_link: 'Links to a listings page',
  missing_job_type: 'No job type',
  missing_closing_date: 'No closing date',
  inferred_closing_date: 'Closing date estimated',
  inferred_location: 'Location estimated',
  inferred_job_type: 'Job type estimated',
  classifier_unsure: 'Check it suits students',
  new_adapter: 'New source',
  review_only_mode: 'Review-only source',
  admin_restored: 'Restored from filter',
}

/**
 * One sentence per reason saying what to check -- the hover text on each
 * chip in the review queue, where the label alone is too short to act on.
 */
export const RISK_REASON_HELP: Record<RiskReason, string> = {
  tier_b_or_c: 'Found on a job board rather than the employer’s own site, so it always gets a human look.',
  missing_title: 'The posting had no title. Add one before publishing.',
  missing_company: 'The posting didn’t name the employer. Add it before publishing.',
  no_direct_link: 'The apply link goes to a list of jobs, not this one. Check it leads to the right role.',
  missing_job_type: 'The posting didn’t say internship, graduate, part-time and so on. Set it before publishing.',
  missing_closing_date: 'The posting has no closing date. Set one, or tick “No closing date”.',
  inferred_closing_date: 'The posting didn’t give a closing date, so one was estimated. Check it against the original.',
  inferred_location: 'The location was worked out from other text. Check it against the original.',
  inferred_job_type: 'The job type was worked out from the title or description. Check it.',
  classifier_unsure: 'The filter couldn’t tell whether this suits students. Check the level and the experience asked for.',
  new_adapter: 'One of the first 10 jobs from this source, which always get a human look.',
  review_only_mode: 'This source is review-only for now, so every job from it waits here.',
  admin_restored: 'The filter removed this and an admin restored it for review.',
}

/** A stored reason may predate a rename, so fall back to the raw value. */
export function riskReasonLabel(reason: string): string {
  return (RISK_REASON_LABELS as Record<string, string>)[reason] ?? reason
}

/** The first N jobs from a new or repaired adapter always get a human look. */
export const NEW_ADAPTER_REVIEW_COUNT = 10

export interface RiskInput {
  job: NormalisedJob
  confidence: NormaliseConfidence
  tier: 'A' | 'B' | 'C'
  verdict: TargetVerdict
  /** Jobs this source has already published (not staged) -- drives 'new_adapter'. */
  publishedFromSource: number
  /** True unless the source has been explicitly flipped to auto-publish. */
  reviewOnly: boolean
}

export function assessRisk(input: RiskInput): RiskReason[] {
  const { job, confidence, tier, verdict, publishedFromSource, reviewOnly } = input
  const reasons: RiskReason[] = []

  if (tier !== 'A') reasons.push('tier_b_or_c')

  // The same fields jobSubmissionSchema demands of a human submitter
  // (lib/job-submission-schema.ts): title, company, a direct apply URL,
  // job_type, and a closing date.
  if (!job.title.trim()) reasons.push('missing_title')
  if (!job.company.trim()) reasons.push('missing_company')
  if (!job.url || !isJobSpecificUrl(job.url)) reasons.push('no_direct_link')
  if (!job.job_type) reasons.push('missing_job_type')
  if (!job.closing_at) reasons.push('missing_closing_date')

  // A field the pipeline guessed rather than read. `tags` is deliberately not
  // checked: keyword inference is the only way tags are ever produced, so
  // flagging every posting for it would hold everything.
  if (confidence.closing_at === 'inferred') reasons.push('inferred_closing_date')
  if (confidence.location === 'inferred') reasons.push('inferred_location')
  if (confidence.job_type === 'inferred') reasons.push('inferred_job_type')

  if (verdict === 'unsure') reasons.push('classifier_unsure')
  if (publishedFromSource < NEW_ADAPTER_REVIEW_COUNT) reasons.push('new_adapter')
  if (reviewOnly) reasons.push('review_only_mode')

  return reasons
}
