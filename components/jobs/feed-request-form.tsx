'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Alert, AlertDescription, Button, Input, Label } from '@/components/ui'
import { PARTNERSHIPS_EMAIL, isValidEmail } from '@/lib/utils'

/**
 * "List your roles with MMSS": an employer gives us their careers page and
 * permission once, instead of submitting each role through /submit. The
 * consent tick is the explicit approval the sync records on the source
 * (lib/sync/source-requests.ts), so it can't be pre-ticked or skipped.
 */
export function FeedRequestForm() {
  const [form, setForm] = useState({ company_name: '', contact_name: '', contact_email: '', careers_url: '' })
  const [consent, setConsent] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [result, setResult] = useState<{ automatic: boolean } | null>(null)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isValidEmail(form.contact_email)) {
      toast.error('Please enter a valid work email address.')
      return
    }
    if (!consent) {
      toast.error('Please confirm we may display your roles.')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/feed-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, consent: true }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Failed to send your request.')
      setResult({ automatic: Boolean(body.automatic) })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (result) {
    return (
      <Alert variant="success">
        <AlertDescription>
          {result.automatic
            ? 'Thanks. We can read your job site automatically: once our team approves the request, new roles will reach Monash marketing students after a quick review, each linking to your own application page.'
            : 'Thanks. Our team will look at your careers page and be in touch about the best way to list your roles.'}
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="contact_name" required>Your name</Label>
          <Input id="contact_name" name="contact_name" value={form.contact_name} onChange={handleChange} placeholder="Jane Smith" required className="mt-1.5" />
        </div>
        <div>
          <Label htmlFor="contact_email" required>Work email</Label>
          <Input id="contact_email" name="contact_email" type="email" value={form.contact_email} onChange={handleChange} placeholder="jane@company.com" required className="mt-1.5" />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="company_name" required>Company name</Label>
          <Input id="company_name" name="company_name" value={form.company_name} onChange={handleChange} placeholder="Acme Corp" required className="mt-1.5" />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="careers_url" required>Careers page link</Label>
          <Input id="careers_url" name="careers_url" type="url" value={form.careers_url} onChange={handleChange} placeholder="https://acme.wd3.myworkdayjobs.com/Careers" required className="mt-1.5" />
          <p className="text-xs text-slate-500 mt-1.5">
            The page where your roles are listed. Workday and Greenhouse job sites are read automatically; for anything else we&apos;ll be in touch.
          </p>
        </div>
      </div>

      <label className="flex items-start gap-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          required
          className="mt-0.5 size-4 shrink-0 accent-primary"
        />
        <span>
          I&apos;m authorised to let MMSS display {form.company_name.trim() || 'my company'}&apos;s public job listings on the
          MMSS Job Board, with each one linking to our own application page. We can withdraw this at any time by emailing{' '}
          {PARTNERSHIPS_EMAIL}.
        </span>
      </label>

      <div className="pt-2">
        <Button type="submit" variant="primary" loading={isSubmitting} className="w-full sm:w-auto">
          Send request
        </Button>
      </div>
    </form>
  )
}
