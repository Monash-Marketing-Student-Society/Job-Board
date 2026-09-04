'use client'

import { useRef, useState } from 'react'
import { UploadSimpleIcon } from '@phosphor-icons/react'
import { Button, Input, Label } from '@/components/ui'
import { createClient } from '@/lib/supabase/client'

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
const LOGO_MIME_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
}

interface LogoUploadFieldProps {
  id: string
  name: string
  label: string
  value: string
  onChange: (url: string) => void
  required?: boolean
}

export function LogoUploadField({ id, name, label, value, onChange, required }: LogoUploadFieldProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

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
      setUploadError('Unsupported file type. Use PNG, JPEG, WebP, or SVG.')
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
      onChange(data.publicUrl)
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
          onChange={(e) => onChange(e.target.value)}
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
        Paste a URL, or upload a PNG, JPEG, WebP, or SVG (max 2MB).
      </p>
      {uploadError && (
        <p className="text-xs text-destructive mt-1">{uploadError}</p>
      )}
      {value && (
        <div className="mt-2 flex items-center gap-2">
          <img
            src={value}
            alt="Logo preview"
            className="w-10 h-10 rounded-lg object-contain border border-border bg-white"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
          <span className="text-xs text-muted-foreground">Preview</span>
        </div>
      )}
    </div>
  )
}
