'use client'

import { useState, useRef } from 'react'
import {
  Button,
  Input,
  NativeSelect,
  NativeSelectOption,
  Label,
  Alert,
  AlertDescription,
  type SelectOption,
} from '@/components/ui'
import { RichTextEditor, type RichTextEditorRef } from '@/components/admin/rich-text-editor'
import { LogoUploadField } from '@/components/admin/logo-upload-field'
import { isValidEmail } from '@/lib/utils'
import type { JobSubmissionInsert, WorkMode, JobType } from '@/lib/types'

const JOB_TYPE_OPTIONS: SelectOption[] = [
  { value: '', label: 'Select job type (optional)' },
  { value: 'internship', label: 'Internship' },
  { value: 'graduate', label: 'Graduate' },
  { value: 'part-time', label: 'Part-time' },
  { value: 'full-time', label: 'Full-time' },
  { value: 'casual', label: 'Casual' },
  { value: 'contract', label: 'Contract' },
]

const WORK_MODE_OPTIONS: SelectOption[] = [
  { value: '', label: 'Select work mode (optional)' },
  { value: 'remote', label: 'Remote' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'onsite', label: 'On-site' },
]

interface JobSubmissionFormProps {
  existingSubmission?: {
    submitter_name: string
    submitter_email: string
    submitter_company_name: string
    title: string
    company: string
    location: string | null
    work_mode: string | null
    job_type: string | null
    url: string
    company_logo_url: string | null
    description: string | null
    summary: string | null
    tags: string[] | null
    closing_at: string | null
  }
  editToken?: string
}

const SUMMARY_MAX_LENGTH = 140

export function JobSubmissionForm({ existingSubmission, editToken }: JobSubmissionFormProps) {
  const isEditing = !!editToken

  const [formData, setFormData] = useState({
    submitter_name: existingSubmission?.submitter_name || '',
    submitter_email: existingSubmission?.submitter_email || '',
    submitter_company_name: existingSubmission?.submitter_company_name || '',
    title: existingSubmission?.title || '',
    company: existingSubmission?.company || '',
    location: existingSubmission?.location || '',
    work_mode: existingSubmission?.work_mode || '',
    job_type: existingSubmission?.job_type || '',
    url: existingSubmission?.url || '',
    company_logo_url: existingSubmission?.company_logo_url || '',
    description: existingSubmission?.description || '',
    summary: existingSubmission?.summary || '',
    tags: existingSubmission?.tags?.join(', ') || '',
    closing_at: existingSubmission?.closing_at
      ? existingSubmission.closing_at.split('T')[0]
      : '',
  })

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [isPrefilling, setIsPrefilling] = useState(false)
  const [prefillStatus, setPrefillStatus] = useState<'idle' | 'success'>('idle')
  const [descriptionKey, setDescriptionKey] = useState(0)

  const editorRef = useRef<RichTextEditorRef>(null)

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    // If the user manually edits a field, clear the prefill badge
    if (prefillStatus === 'success') setPrefillStatus('idle')
  }

  const handleUrlBlur = async () => {
    const url = formData.url.trim()
    if (!url || isPrefilling || isEditing) return
    try { new URL(url) } catch { return }

    const PREFILLABLE_FIELDS = [
      'title', 'company', 'company_logo_url',
      'location', 'job_type', 'closing_at', 'tags', 'summary',
    ] as const

    setIsPrefilling(true)
    setPrefillStatus('idle')

    // Clear all prefillable fields immediately so stale data from the
    // previous URL never lingers while the new one is loading.
    setFormData(prev => {
      const next = { ...prev }
      for (const field of PREFILLABLE_FIELDS) next[field] = ''
      next.description = ''
      return next
    })
    // Remount the editor so it visually clears too
    setDescriptionKey(k => k + 1)

    try {
      const res = await fetch(`/api/prefill-job?url=${encodeURIComponent(url)}`)
      if (!res.ok) return

      const body = await res.json()
      const data: Record<string, string> = body.data ?? {}

      let filled = 0

      setFormData(prev => {
        const next = { ...prev }
        for (const field of PREFILLABLE_FIELDS) {
          let value = data[field]
          // Only accept absolute URLs for the logo field to avoid browser URL validation errors
          if (field === 'company_logo_url' && value && !/^https?:\/\//i.test(value)) {
            value = ''
          }
          if (value) { next[field] = value; filled++ }
        }
        if (data.description) { next.description = data.description; filled++ }
        return next
      })

      // If a description came back, remount editor again with the new content
      if (data.description) setDescriptionKey(k => k + 1)

      if (filled > 0) setPrefillStatus('success')
    } catch {
      // Fail silently — user fills manually
    } finally {
      setIsPrefilling(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setStatus('idle')
    setErrorMessage('')

    if (!isValidEmail(formData.submitter_email)) {
      setErrorMessage('Please enter a valid work email address.')
      setStatus('error')
      setIsSubmitting(false)
      return
    }

    const tags = formData.tags
      .split(',')
      .map(t => t.trim())
      .filter(Boolean)

    const submission: JobSubmissionInsert = {
      submitter_name: formData.submitter_name,
      submitter_email: formData.submitter_email,
      submitter_company_name: formData.submitter_company_name,
      title: formData.title,
      company: formData.company,
      location: formData.location || null,
      work_mode: (formData.work_mode as WorkMode) || null,
      job_type: (formData.job_type as JobType) || null,
      url: formData.url,
      description: formData.description || null,
      summary: formData.summary || null,
      company_logo_url: formData.company_logo_url || null,
      tags: tags.length > 0 ? tags : null,
      closing_at: formData.closing_at
        ? new Date(formData.closing_at).toISOString()
        : null,
    }

    try {
      const endpoint = isEditing
        ? `/api/submit-job/${editToken}`
        : '/api/submit-job'
      const method = isEditing ? 'PATCH' : 'POST'

      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submission),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Failed to submit.')
      }

      setStatus('success')
    } catch (err) {
      setStatus('error')
      setErrorMessage(
        err instanceof Error ? err.message : 'Something went wrong. Please try again.'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  if (status === 'success') {
    return (
      <Alert variant="success">
        <AlertDescription>
          {isEditing
            ? 'Your submission has been updated. Our team will review it shortly.'
            : <>Your listing has been submitted for review. If you have any questions, email <a href="mailto:enquiries@monashmss.com" className="underline font-medium">enquiries@monashmss.com</a>.</>}
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {status === 'error' && (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      {/* Contact info */}
      <div>
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4">
          Your Details
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="submitter_name" required>Your name</Label>
            <Input
              id="submitter_name"
              name="submitter_name"
              value={formData.submitter_name}
              onChange={handleChange}
              placeholder="Jane Smith"
              required
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="submitter_email" required>Work email</Label>
            <Input
              id="submitter_email"
              name="submitter_email"
              type="email"
              value={formData.submitter_email}
              onChange={handleChange}
              placeholder="jane@company.com"
              required
              className="mt-1.5"
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="submitter_company_name" required>Company name (confirmation)</Label>
            <Input
              id="submitter_company_name"
              name="submitter_company_name"
              value={formData.submitter_company_name}
              onChange={handleChange}
              placeholder="Acme Corp"
              required
              className="mt-1.5"
            />
          </div>
        </div>
      </div>

      {/* Job details */}
      <div className="border-t pt-6">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4">
          Job Details
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="title" required>Job title</Label>
            <Input
              id="title"
              name="title"
              value={formData.title}
              onChange={handleChange}
              placeholder="Marketing Intern"
              required
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="company" required>Company (for the listing)</Label>
            <Input
              id="company"
              name="company"
              value={formData.company}
              onChange={handleChange}
              placeholder="Acme Corp"
              required
              className="mt-1.5"
            />
          </div>

          <div className="sm:col-span-2">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="summary">Short summary</Label>
              <span className="text-xs text-slate-400">
                {formData.summary.length}/{SUMMARY_MAX_LENGTH}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5 mb-1.5">
              One sentence shown on the job card — auto-filled from the URL below, editable.
            </p>
            <Input
              id="summary"
              name="summary"
              value={formData.summary}
              onChange={handleChange}
              placeholder="e.g. Support brand campaigns and social content for a growing retail team."
              maxLength={SUMMARY_MAX_LENGTH}
              className="mt-1.5"
            />
          </div>

          {/* Application URL — triggers prefill on blur */}
          <div className="sm:col-span-2">
            <Label htmlFor="url" required>Application URL</Label>
            <p className="text-xs text-slate-400 mt-0.5 mb-1.5">
              Paste the link and tab away — we&apos;ll try to fill in the details automatically.
            </p>
            <div className="relative">
              <Input
                id="url"
                name="url"
                type="url"
                value={formData.url}
                onChange={handleChange}
                onBlur={handleUrlBlur}
                placeholder="https://company.com/apply"
                required
                className={isPrefilling ? 'pr-10' : ''}
              />
              {isPrefilling && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                  <svg className="h-4 w-4 animate-spin text-slate-400" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                </div>
              )}
            </div>
            {prefillStatus === 'success' && (
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-green-600">
                <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Details prefilled — review and adjust as needed
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="location">Location</Label>
            <Input
              id="location"
              name="location"
              value={formData.location}
              onChange={handleChange}
              placeholder="Melbourne, VIC"
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="work_mode">Work mode</Label>
            {/* The gap sits on a wrapper rather than on the field: a margin on
                the select itself would grow the box the chevron is centred in,
                and drop the icon below the text by half that margin. */}
            <div className="mt-1.5">
              <NativeSelect
                id="work_mode"
                name="work_mode"
                value={formData.work_mode}
                onChange={handleChange}
              >
                {WORK_MODE_OPTIONS.map((option) => (
                  <NativeSelectOption key={option.value} value={option.value}>
                    {option.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          </div>
          <div>
            <Label htmlFor="job_type">Job type</Label>
            <div className="mt-1.5">
              <NativeSelect
                id="job_type"
                name="job_type"
                value={formData.job_type}
                onChange={handleChange}
              >
                {JOB_TYPE_OPTIONS.map((option) => (
                  <NativeSelectOption key={option.value} value={option.value}>
                    {option.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          </div>
          <div>
            <Label htmlFor="closing_at">Application closing date</Label>
            <Input
              id="closing_at"
              name="closing_at"
              type="date"
              value={formData.closing_at}
              onChange={handleChange}
              className="mt-1.5"
            />
          </div>
          <LogoUploadField
            id="company_logo_url"
            name="company_logo_url"
            label="Company logo URL"
            value={formData.company_logo_url}
            onChange={(url) => {
              setFormData((prev) => ({ ...prev, company_logo_url: url }))
              // Same as a manual edit via handleChange: clear the prefill
              // badge once the user has touched what it filled in.
              if (prefillStatus === 'success') setPrefillStatus('idle')
            }}
          />
          <div className="sm:col-span-2">
            <Label htmlFor="tags">Skills / tags</Label>
            <Input
              id="tags"
              name="tags"
              value={formData.tags}
              onChange={handleChange}
              placeholder="marketing, social media, Excel (comma-separated)"
              className="mt-1.5"
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Job description</Label>
            <div className="mt-1.5">
              <RichTextEditor
                key={descriptionKey}
                ref={editorRef}
                content={formData.description}
                onChange={html => setFormData(prev => ({ ...prev, description: html }))}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="border-t pt-6">
        <Button type="submit" variant="primary" loading={isSubmitting} className="w-full sm:w-auto">
          {isEditing ? 'Update Submission' : 'Submit Job Listing'}
        </Button>
      </div>
    </form>
  )
}
