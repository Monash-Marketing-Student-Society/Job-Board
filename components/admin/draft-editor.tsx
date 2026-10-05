'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CheckIcon, FloppyDiskIcon } from '@phosphor-icons/react'
import { Button, Input, Label, NativeSelect, NativeSelectOption, TagCombobox, useConfirmDialog } from '@/components/ui'
import { JobDetailPanel } from '@/components/jobs/job-detail-panel'
import { RichTextEditor } from './rich-text-editor'
import { JOB_TYPE_OPTIONS, WORK_MODE_OPTIONS } from './job-form'
import { cn, decodeHtmlEntities, isValidApplicationUrl } from '@/lib/utils'
import { toJobFunctions, type JobFunction } from '@/lib/tags'
import type { Job } from '@/lib/types'

/**
 * Edit a pending job and see it exactly as students will, side by side,
 * before approving it. Used by both queues on /admin/submissions: an HR
 * submission and a synced job held for review.
 *
 * The preview is the real JobDetailPanel fed from the form as you type, so
 * nothing drifts from the live layout. Approve saves any unsaved edits first,
 * so what goes live is what's on screen.
 */

export type DraftKind = 'submission' | 'synced'

interface DraftEditorProps {
  kind: DraftKind
  draft: Job
  /** What approving does beyond publishing, e.g. who gets emailed. */
  approveNote: string
}

interface FormState {
  title: string
  company: string
  location: string
  work_mode: string
  job_type: string
  url: string
  description: string
  summary: string
  tags: JobFunction[]
  closing_at: string
}

function toForm(job: Job): FormState {
  return {
    // Synced titles can arrive HTML-encoded ("Associate &amp; Creator");
    // decoded here so the admin sees, and saves, the plain text.
    title: decodeHtmlEntities(job.title),
    company: decodeHtmlEntities(job.company),
    location: job.location ? decodeHtmlEntities(job.location) : '',
    work_mode: job.work_mode ?? '',
    job_type: job.job_type ?? '',
    url: job.url,
    description: job.description ?? '',
    summary: job.summary ?? '',
    tags: toJobFunctions(job.tags ?? []),
    closing_at: job.closing_at ? job.closing_at.split('T')[0] : '',
  }
}

function toBody(form: FormState) {
  return {
    title: form.title,
    company: form.company,
    location: form.location || null,
    work_mode: form.work_mode || null,
    job_type: form.job_type || null,
    url: form.url.trim(),
    description: form.description || null,
    summary: form.summary || null,
    tags: form.tags,
    closing_at: form.closing_at ? new Date(form.closing_at).toISOString() : null,
  }
}

const API_BASE: Record<DraftKind, string> = {
  submission: '/api/admin/submissions',
  synced: '/api/admin/staged',
}

export function DraftEditor({ kind, draft, approveNote }: DraftEditorProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState<FormState>(() => toForm(draft))
  const [form, setForm] = useState<FormState>(saved)
  const { confirm, dialog } = useConfirmDialog()

  const dirty = JSON.stringify(form) !== JSON.stringify(saved)
  const base = `${API_BASE[kind]}/${draft.id}`

  const preview: Job = useMemo(() => {
    const body = toBody(form)
    return { ...draft, ...body, work_mode: body.work_mode as Job['work_mode'], job_type: body.job_type as Job['job_type'] }
  }, [draft, form])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((prev) => ({ ...prev, [key]: value }))
  const onField = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    set(e.target.name as keyof FormState, e.target.value as never)

  /** Saves the form; false (with a toast saying why) if it didn't. */
  const save = async (): Promise<boolean> => {
    if (!form.title.trim() || !form.company.trim()) {
      toast.error('A job needs a title and a company')
      return false
    }
    if (!isValidApplicationUrl(form.url.trim())) {
      toast.error('The application link must be an http(s) URL or an email address')
      return false
    }
    const res = await fetch(base, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(toBody(form)),
    }).catch(() => null)
    const payload = res ? await res.json().catch(() => ({})) : {}
    if (!res?.ok) {
      toast.error(payload.error || 'Could not save changes')
      return false
    }
    setSaved(form)
    return true
  }

  const onSave = () =>
    startTransition(async () => {
      if (await save()) {
        toast.success('Changes saved')
        router.refresh()
      }
    })

  const onApprove = async () => {
    const { confirmed } = await confirm({
      title: dirty ? 'Save and publish this job?' : 'Publish this job?',
      description: `It goes live on the public board straight away. ${approveNote}`,
      confirmLabel: dirty ? 'Save and publish' : 'Approve and publish',
    })
    if (!confirmed) return

    startTransition(async () => {
      if (dirty && !(await save())) return
      const res = await fetch(`${base}/approve`, { method: 'POST' }).catch(() => null)
      const payload = res ? await res.json().catch(() => ({})) : {}
      if (!res?.ok) {
        toast.error(payload.error || 'Could not publish the job')
        return
      }
      if (payload.email_sent === false) {
        toast.warning('Job published, but the approval email failed to send', {
          description: payload.email_error,
          duration: 10000,
        })
      } else {
        toast.success('Job published to the live board')
      }
      router.push('/admin/submissions')
      router.refresh()
    })
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:items-start">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onSave()
        }}
        className="space-y-4 rounded-xl bg-white p-4 lg:sticky lg:top-[96px] lg:max-h-[calc(100vh-112px)] lg:overflow-y-auto"
        aria-label="Edit this job before publishing"
      >
        <div>
          <Label htmlFor="title" required>Job title</Label>
          <Input id="title" name="title" value={form.title} onChange={onField} required className="mt-1.5" />
        </div>

        <div>
          <Label htmlFor="company" required>Company</Label>
          <Input id="company" name="company" value={form.company} onChange={onField} required className="mt-1.5" />
        </div>

        <div>
          <Label htmlFor="location">Location</Label>
          <Input id="location" name="location" value={form.location} onChange={onField} placeholder="Melbourne, VIC" className="mt-1.5" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="work_mode">Work mode</Label>
            <div className="mt-1.5">
              <NativeSelect id="work_mode" name="work_mode" value={form.work_mode} onChange={onField}>
                {WORK_MODE_OPTIONS.map((o) => (
                  <NativeSelectOption key={o.value} value={o.value}>{o.label}</NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          </div>
          <div>
            <Label htmlFor="job_type">Job type</Label>
            <div className="mt-1.5">
              <NativeSelect id="job_type" name="job_type" value={form.job_type} onChange={onField}>
                {JOB_TYPE_OPTIONS.map((o) => (
                  <NativeSelectOption key={o.value} value={o.value}>{o.label}</NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          </div>
        </div>

        <div>
          <Label htmlFor="url" required>Application link</Label>
          <Input id="url" name="url" inputMode="url" value={form.url} onChange={onField} required className="mt-1.5" />
        </div>

        <div>
          <Label htmlFor="closing_at">Closing date</Label>
          <Input id="closing_at" name="closing_at" type="date" value={form.closing_at} onChange={onField} className="mt-1.5" />
        </div>

        <div>
          <Label htmlFor="tags">Job function</Label>
          <TagCombobox id="tags" value={form.tags} onChange={(tags: JobFunction[]) => set('tags', tags)} className="mt-1.5" />
        </div>

        {/* A synced job publishes without a summary -- the card falls back to
            the description -- so the field is only offered for submissions. */}
        {kind === 'submission' && (
          <div>
            <Label htmlFor="summary">Short summary</Label>
            <Input id="summary" name="summary" value={form.summary} onChange={onField} maxLength={140} className="mt-1.5" />
          </div>
        )}

        <div>
          <Label>Description</Label>
          <div className="mt-1.5">
            <RichTextEditor content={form.description} onChange={(html) => set('description', html)} />
          </div>
        </div>

        <div className="sticky bottom-0 -mx-4 -mb-4 flex flex-wrap items-center gap-2 border-t border-slate-100 bg-white px-4 py-3">
          <Button type="submit" variant="outline" disabled={!dirty || isPending}>
            <FloppyDiskIcon className="size-4" />
            Save changes
          </Button>
          <Button type="button" variant="primary" loading={isPending} onClick={onApprove}>
            <CheckIcon weight="bold" className="size-4" />
            {dirty ? 'Save and publish' : 'Approve and publish'}
          </Button>
          <span className={cn('text-xs text-muted-foreground', !dirty && 'invisible')}>Unsaved changes</span>
        </div>
      </form>

      {/* min-h: JobDetailPanel's main view is a flex column with h-full and
          its own scroll area, so it collapses without a height to fill. */}
      <div className="min-h-[70vh]">
        <JobDetailPanel job={preview} isMainView preview />
      </div>

      {dialog}
    </div>
  )
}
