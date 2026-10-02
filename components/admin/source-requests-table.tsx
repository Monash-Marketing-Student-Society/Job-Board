'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowSquareOutIcon, CheckIcon, XIcon } from '@phosphor-icons/react'
import { useConfirmDialog } from '@/components/ui'
import { IconActionButton } from './table'
import { cn, formatDate, gmailComposeHref } from '@/lib/utils'

/**
 * Employers' "List your roles with MMSS" requests, on /admin/sources. An
 * approval probes the feed and creates a review-only source carrying the
 * employer's explicit consent; a request for a job system we can't read is
 * a follow-up by email, so it has no Approve button.
 */

export interface SourceRequestRow {
  id: string
  created_at: string
  company_name: string
  contact_name: string
  contact_email: string
  careers_url: string
  detected_vendor: string | null
}

export function SourceRequestsTable({ rows }: { rows: SourceRequestRow[] }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const { confirm, dialog } = useConfirmDialog()

  const act = (row: SourceRequestRow, action: 'approve' | 'reject') => {
    setBusyId(row.id)
    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin/source-requests/${row.id}/${action}`, { method: 'POST' })
        const payload = await res.json().catch(() => ({}))
        if (!res.ok) {
          toast.error(payload.error || 'Action failed')
          if (res.status === 409) router.refresh()
          return
        }
        toast.success(
          action === 'approve'
            ? payload.existing
              ? `${row.company_name} is already a source (${payload.slug}). Their consent is now recorded on it.`
              : `${row.company_name} added (${payload.postings} live postings). Its first run is tonight, review-only.`
            : `${row.company_name}'s request declined.`
        )
        router.refresh()
      } finally {
        setBusyId(null)
      }
    })
  }

  const approve = async (row: SourceRequestRow) => {
    const { confirmed } = await confirm({
      title: `Add ${row.company_name} as a source?`,
      description:
        'We check the feed answers, then read it every night from tonight. Its jobs wait for review like every other new source. The employer confirmed MMSS may display them.',
      confirmLabel: 'Check and add',
    })
    if (confirmed) act(row, 'approve')
  }

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-base font-semibold text-slate-800 font-heading">Employer requests</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          {rows.length === 0
            ? 'None waiting. Employers ask to have their roles listed automatically at /submit/feed.'
            : 'Employers asking to have their roles listed automatically. Each has confirmed MMSS may display them.'}
        </p>
      </div>

      {rows.length > 0 && (
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.id} className="flex items-start justify-between gap-3 rounded-xl bg-slate-50 p-3">
              <div className="min-w-0">
                <div className="flex items-center gap-1">
                  <p className="text-sm font-medium text-slate-800 truncate">{row.company_name}</p>
                  <a
                    href={row.careers_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open ${row.company_name}'s careers page`}
                    title={row.careers_url}
                    className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
                  >
                    <ArrowSquareOutIcon className="size-3.5" />
                  </a>
                </div>
                <p className="text-xs text-muted-foreground">
                  <a href={gmailComposeHref(row.contact_email)} target="_blank" rel="noopener noreferrer" className="hover:text-primary">
                    {row.contact_name} · {row.contact_email}
                  </a>
                  {' · '}
                  {formatDate(row.created_at)}
                </p>
                <p className={cn('mt-1 text-xs', row.detected_vendor ? 'text-success' : 'text-warning')}>
                  {row.detected_vendor
                    ? `${row.detected_vendor === 'workday' ? 'Workday' : 'Greenhouse'}: can be read automatically`
                    : 'Job system not recognised: follow up by email'}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {row.detected_vendor && (
                  <IconActionButton
                    label="Check and add as a source"
                    disabled={busyId === row.id}
                    className="text-success hover:text-success hover:bg-success/10"
                    onClick={() => approve(row)}
                  >
                    <CheckIcon weight="bold" className="size-4" />
                  </IconActionButton>
                )}
                <IconActionButton
                  label="Decline"
                  disabled={busyId === row.id}
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => act(row, 'reject')}
                >
                  <XIcon weight="bold" className="size-4" />
                </IconActionButton>
              </div>
            </div>
          ))}
        </div>
      )}
      {dialog}
    </div>
  )
}
