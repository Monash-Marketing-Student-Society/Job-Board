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
