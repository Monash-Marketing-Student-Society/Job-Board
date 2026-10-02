'use client'

import { useEffect, useRef, useState } from 'react'
import { UploadSimpleIcon } from '@phosphor-icons/react'
import { Button, Input, Label } from '@/components/ui'
import { createClient } from '@/lib/supabase/client'
import { autoMatch, brandfetchLogoUrl, brandSearchUrl, parseBrandSearch, type BrandMatch } from '@/lib/logos'

/**
 * Shared by the admin job form and the public /submit form (same pairing
 * as RichTextEditor, which /submit also reaches into components/admin for)
 * — both just need "a URL, or a file that becomes a URL" and had drifted
 * into two copies of the same upload logic before this.
 *
 * Mirrors the `company-logos` storage bucket's own file_size_limit /
 * allowed_mime_types (supabase/migrations/0014_add_company_logo_storage.sql)
 * — checked client-side too so a bad file is rejected before the upload
 * round-trip instead of only after. The public form's anon uploads are
 * covered by 0015_public_logo_upload.sql; admin uploads by 0014's own
 * is_admin() policy.
 */
const LOGO_MAX_BYTES = 2 * 1024 * 1024
const PREVIEW_DEBOUNCE_MS = 400
const SEARCH_DEBOUNCE_MS = 400
const SEARCH_MIN_CHARS = 2
// No SVG: the bucket is public and anon can upload to it, so accepting an
// executable document format would let anyone host script at a URL on the
// project's own Supabase origin. See the note in 0014 for the full reasoning.
// An employer with an SVG logo can still paste its URL into the same field.
const LOGO_MIME_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

interface LogoUploadFieldProps {
  id: string
  name: string
  label: string
  value: string
  /** `auto` when the field filled itself from a company-name match, so a caller can tell it from an edit. */
  onChange: (url: string, origin?: 'auto' | 'user') => void
  required?: boolean
  /** The form's company name. When set, matching logos are suggested from it (see lib/logos.ts). */
  companyName?: string
}

/**
 * Logo suggestions for a company name, from Brandfetch Brand Search.
 *
 * Fetched from the browser on purpose: Brandfetch allows this API only as
 * client-side autocomplete. Settles before searching (one request per name the
 * user meant, not per keystroke) and drops a stale response when the name has
 * moved on. Any failure is just "no suggestions" -- the field still works.
 */
function useBrandMatches(companyName: string | undefined) {
  const [result, setResult] = useState<{ query: string; matches: BrandMatch[] }>({ query: '', matches: [] })
  const query = (companyName ?? '').trim()

  useEffect(() => {
    if (query.length < SEARCH_MIN_CHARS) return
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(brandSearchUrl(query), { signal: controller.signal })
        const matches = res.ok ? parseBrandSearch(await res.json()) : []
        setResult({ query, matches })
      } catch {
        if (!controller.signal.aborted) setResult({ query, matches: [] })
      }
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query])

  // Matches for an older name are never shown against the current one. A
  // stable empty array, so effects keyed on this don't re-run every render.
  return result.query === query ? result.matches : NO_MATCHES
}

const NO_MATCHES: BrandMatch[] = []

export function LogoUploadField({ id, name, label, value, onChange, required, companyName }: LogoUploadFieldProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Which URL failed to load, not a boolean "did something fail".
  //
  // Storing the value means the check below (`failedSrc !== value`) corrects
  // itself the moment `value` changes — no reset needed in the URL input's
  // onChange, none after a successful upload, and no path that can be missed
  // when a future field starts writing to `value`. Re-entering a known-bad URL
  // also stays hidden without a second round trip.
  const [failedSrc, setFailedSrc] = useState<string | null>(null)

  // The URL the preview is actually pointed at, trailing `value` by a beat.
  //
  // `value` changes on every keystroke, and the preview is rendered only while
  // it has not failed — so previewing `value` directly meant every partial URL
  // ("h", "ht", "htt"…) mounted an <img>, failed, and unmounted it again. The
  // block strobed the whole time the user was typing, and each keystroke fired
  // a request for a string that could not possibly resolve.
  //
  // Settling first means one attempt per URL the user actually meant. An
  // upload's public URL lands here a beat late too, which is unnoticeable next
  // to the upload it follows.
  const [previewSrc, setPreviewSrc] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setPreviewSrc(value), PREVIEW_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [value])

  const matches = useBrandMatches(companyName)

  // The URL this field last filled in by itself. Auto-fill only ever replaces
  // an empty value or its own earlier pick -- never a URL the user pasted,
  // uploaded or clicked, and never the saved logo of a job being edited.
  const autoFilledRef = useRef<string | null>(null)

  useEffect(() => {
    if (matches === NO_MATCHES) return
    const match = autoMatch(companyName ?? '', matches)
    const url = match ? brandfetchLogoUrl(match.domain) : null
    if (url === value) return
    if (value !== '' && value !== autoFilledRef.current) return
    if (!url && value === '') return
    // A new company name with no confident match also takes back an earlier
    // auto-fill -- otherwise "Ogilvy" changed to "Bain" keeps Ogilvy's logo.
    autoFilledRef.current = url
    onChange(url ?? '', 'auto')
    // onChange is a fresh closure on every parent render; matches is what drives this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches])

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // Let the same input be used again for a second attempt after an
    // error — without this, picking the same file twice in a row is a
    // no-op change event and never fires.
    e.target.value = ''
    if (!file) return

    setUploadError('')

    const ext = LOGO_MIME_TO_EXT[file.type]
    if (!ext) {
      setUploadError('Unsupported file type. Use PNG, JPEG or WebP — or paste a URL instead.')
      return
    }
    if (file.size > LOGO_MAX_BYTES) {
      setUploadError('File is too large. Max 2MB.')
      return
    }

    setIsUploading(true)
    try {
      const supabase = createClient()
      const path = `${crypto.randomUUID()}.${ext}`
      const { error: uploadErr } = await supabase.storage
        .from('company-logos')
        .upload(path, file, { contentType: file.type })

      if (uploadErr) throw uploadErr

      const { data } = supabase.storage.from('company-logos').getPublicUrl(path)
      onChange(data.publicUrl, 'user')
    } catch (err) {
      console.error('Error uploading logo:', err)
      setUploadError(err instanceof Error ? err.message : 'Failed to upload logo')
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div>
      <Label htmlFor={id} required={required}>{label}</Label>
      <div className="mt-1.5 flex gap-2">
        <Input
          id={id}
          name={name}
          type="url"
          value={value}
          onChange={(e) => onChange(e.target.value, 'user')}
          placeholder="https://company.com/logo.png"
          className="flex-1"
        />
        <input
          ref={fileInputRef}
          type="file"
          accept={Object.keys(LOGO_MIME_TO_EXT).join(',')}
          onChange={handleFileChange}
          className="hidden"
        />
        <Button
          type="button"
          variant="primary"
          className="gap-1.5"
          loading={isUploading}
          onClick={() => fileInputRef.current?.click()}
        >
          <UploadSimpleIcon weight="bold" className="size-3.5" />
          Upload
        </Button>
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        Paste a URL, or upload a PNG, JPEG or WebP (max 2MB).
      </p>
      {uploadError && (
        <p className="text-xs text-destructive mt-1">{uploadError}</p>
      )}
      {matches.length > 0 && (
        <div className="mt-2">
          <p className="text-xs text-muted-foreground">
            {value === autoFilledRef.current && value !== ''
              ? 'Logo matched from the company name. Not right? Pick another:'
              : 'Logos matching the company name:'}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {matches.map((m) => {
              const url = brandfetchLogoUrl(m.domain)!
              const selected = url === value
              return (
                <button
                  key={m.domain}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onChange(selected ? '' : url, 'user')}
                  className={`flex items-center gap-2 rounded-lg border py-1 pl-1 pr-2.5 text-left text-xs transition-colors ${
                    selected ? 'border-primary bg-primary/5' : 'border-border bg-white hover:border-slate-300'
                  }`}
                >
                  <img src={url} alt="" className="size-7 rounded-md border border-border bg-white object-contain" />
                  <span className="min-w-0">
                    <span className="block font-medium text-foreground">{m.name}</span>
                    <span className="block text-muted-foreground">{m.domain}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
      {/* Hiding the whole block, not just the image: the old handler set
          display:none on the <img> alone and left the "Preview" caption
          sitting next to nothing. */}
      {previewSrc && failedSrc !== previewSrc && (
        <div className="mt-2 flex items-center gap-2">
          <img
            src={previewSrc}
            alt="Logo preview"
            className="w-10 h-10 rounded-lg object-contain border border-border bg-white"
            onError={() => setFailedSrc(previewSrc)}
          />
          <span className="text-xs text-muted-foreground">Preview</span>
        </div>
      )}
    </div>
  )
}
