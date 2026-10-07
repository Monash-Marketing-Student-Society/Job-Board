import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeftIcon, ArrowSquareOutIcon } from '@phosphor-icons/react/dist/ssr'
import { createServerClient } from '@/lib/supabase/server'
import { DraftEditor } from '@/components/admin/draft-editor'
import { DraftPreview } from '../../[id]/preview/draft-preview'
import { softButtonClassName } from '@/components/admin/table'
import { riskReasonLabel } from '@/lib/sync/risk'
import { cn, toApplicationHref } from '@/lib/utils'
import type { Job } from '@/lib/types'
import type { NormalisedJob } from '@/lib/sync/normalise'

export const metadata = {
  title: 'Synced job preview | Admin | MMSS Job Board',
}

interface PageProps {
  params: Promise<{ id: string }>
}

/**
 * A synced job held for review, shown as students will see it and editable
 * before it goes live. Opened by clicking the job's title in "Synced jobs to
 * review". Read through the admin's session (staged_jobs has an admin SELECT
 * policy, 0030); saving goes through PATCH /api/admin/staged/[id].
 *
 * The draft mirrors approveStaged's insert: no summary, never sponsored, and
 * the posting's own posted_at.
 */
export default async function SyncedJobPreviewPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from('staged_jobs')
    .select('id, status, created_at, risk_reasons, normalised, sources(name)')
    .eq('id', id)
    .maybeSingle()
  if (error || !data) notFound()

  const j = data.normalised as NormalisedJob
  const src = Array.isArray(data.sources) ? data.sources[0] : data.sources
  const reasons = ((data.risk_reasons ?? []) as string[]).filter((r) => r !== 'review_only_mode')
  const pending = data.status === 'pending'

  const draft: Job = {
    id: data.id,
    source: 'sync',
    external_id: null,
    title: j.title,
    company: j.company,
    location: j.location,
    work_mode: j.work_mode,
    job_type: j.job_type,
    url: j.url,
    description: j.description,
    summary: null,
    company_logo_url: null,
    tags: j.tags,
    posted_at: j.posted_at,
    closing_at: j.closing_at,
    is_active: true,
    is_sponsored: false,
    created_at: data.created_at,
    updated_at: data.created_at,
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
        <a
          href={toApplicationHref(j.url)}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(softButtonClassName, 'ml-auto inline-flex items-center whitespace-nowrap text-sm font-medium transition-colors')}
        >
          <ArrowSquareOutIcon weight="bold" className="size-3.5" />
          Original posting
        </a>
      </div>

      <div className="rounded-xl bg-warning/10 px-4 py-3">
        <p className="text-sm font-medium text-slate-800">
          {pending ? 'Synced job — not published' : `Synced job — ${data.status}`}
        </p>
        <p className="mt-0.5 text-xs text-slate-600">
          From {src?.name ?? 'an unknown source'}.
          {reasons.length > 0 && ` Held because: ${reasons.map(riskReasonLabel).join(', ').toLowerCase()}.`}
          {pending && ' Edit it on the left; the preview shows exactly how it will look on the board.'}
        </p>
      </div>

      {pending ? (
        <DraftEditor kind="synced" draft={draft} approveNote="No one is emailed — synced jobs have no submitter." />
      ) : (
        <div className="min-h-[70vh]">
          <DraftPreview job={draft} />
        </div>
      )}
    </div>
  )
}
