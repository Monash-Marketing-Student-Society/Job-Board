/**
 * Upload a logo file to the public `company-logos` bucket from the browser
 * and return its public URL. Shared by the job forms' LogoUploadField and
 * /admin/logos.
 *
 * Mirrors the bucket's own file_size_limit / allowed_mime_types
 * (supabase/migrations/0014_add_company_logo_storage.sql), checked here too so
 * a bad file is rejected before the upload round-trip. No SVG: the bucket is
 * public and anon can upload to it (0015), so an executable document format
 * would let anyone host script on the project's own origin.
 */

import { createClient } from '@/lib/supabase/client'

export const LOGO_MAX_BYTES = 2 * 1024 * 1024

export const LOGO_MIME_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

export async function uploadLogoFile(file: File): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const ext = LOGO_MIME_TO_EXT[file.type]
  if (!ext) return { ok: false, error: 'Unsupported file type. Use PNG, JPEG or WebP — or paste a URL instead.' }
  if (file.size > LOGO_MAX_BYTES) return { ok: false, error: 'File is too large. Max 2MB.' }

  try {
    const supabase = createClient()
    const path = `${crypto.randomUUID()}.${ext}`
    const { error } = await supabase.storage.from('company-logos').upload(path, file, { contentType: file.type })
    if (error) throw error
    return { ok: true, url: supabase.storage.from('company-logos').getPublicUrl(path).data.publicUrl }
  } catch (err) {
    console.error('Error uploading logo:', err)
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to upload logo' }
  }
}
