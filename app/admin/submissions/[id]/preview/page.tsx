import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeftIcon, ArrowSquareOutIcon } from '@phosphor-icons/react/dist/ssr'
import { createServerClient } from '@/lib/supabase/server'
import { DraftPreview } from './draft-preview'
import { StatusDot, softButtonClassName, type StatusDotRole } from '@/components/admin/table'
import { cn, toApplicationHref } from '@/lib/utils'
import type { JobSubmission, Job } from '@/lib/types'

export const metadata = {
  title: 'Draft preview | Admin | MMSS Job Board',
}

const STATUS_ROLE: Record<JobSubmission['status'], StatusDotRole> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'destructive',
}

interface PageProps {
  params: Promise<{ id: string }>
}

/**
 * How a submission will look on the public board, before anyone approves it.
 *
 * Renders the real `JobDetailPanel` — the same component a visitor sees when
 * they open a listing — from the submission's own fields, rather than a
 * bespoke summary that would drift from the live layout. `preview` stops it
 * recording analytics against an id that isn't in `jobs` yet.
 *
 * Read-only on purpose: approve and reject stay in the queue, where the
 * confirmation dialogs and their emails already live.
 *
 * The mapping below mirrors the insert in
 * app/api/admin/submissions/[id]/approve/route.ts field for field, so what
 * this shows is what approval actually publishes. Two deliberate
 * differences, both matching that route: `posted_at` is set at approval time
 * (shown here as today), and `is_sponsored` is false regardless of what the
 * submitter requested.
 */
export default async function SubmissionPreviewPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from('job_submissions')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  const submission = data as JobSubmission | null
  if (error || !submission) notFound()

  const draft: Job = {
    id: submission.id,
    source: 'submission',
    external_id: null,
    title: submission.title,
    company: submission.company,
    location: submission.location,
    work_mode: submission.work_mode,
    job_type: submission.job_type,
    url: submission.url,
    description: submission.description,
    summary: submission.summary,
    company_logo_url: submission.company_logo_url,
    tags: submission.tags,
    posted_at: new Date().toISOString(),
    closing_at: submission.closing_at,
    is_active: true,
    is_sponsored: false,
    created_at: submission.created_at,
    updated_at: submission.created_at,
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/admin/submissions"
          className={cn(softButtonClassName, 'inline-flex items-center whitespace-nowrap text-sm font-medium transition-colors')}
        >
          <ArrowLeftIcon weight="bold" className="size-3.5" />
          Back to queue
        </Link>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-slate-100/70 px-3.5">
            <StatusDot role={STATUS_ROLE[submission.status]} label={submission.status} />
          </span>
          {/* The employer's own link, still one click away — the row's icon
              now opens this preview instead. */}
          <a
            href={toApplicationHref(submission.url)}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(softButtonClassName, 'inline-flex items-center whitespace-nowrap text-sm font-medium transition-colors')}
          >
            <ArrowSquareOutIcon weight="bold" className="size-3.5" />
            Original listing
          </a>
        </div>
      </div>

      <div className="rounded-xl bg-warning/10 px-4 py-3">
        <p className="text-sm font-medium text-slate-800">
          Draft preview — not published
        </p>
        <p className="mt-0.5 text-xs text-slate-600">
          Exactly how this listing will appear on the board once approved. Approving publishes it
          and emails {submission.submitter_name} at {submission.submitter_email}.
        </p>
      </div>

      {/* min-h: JobDetailPanel's main view is a flex column with h-full and
          its own scroll area, so it collapses without a height to fill. */}
      <div className="min-h-[70vh]">
        <DraftPreview job={draft} />
      </div>
    </div>
  )
}
