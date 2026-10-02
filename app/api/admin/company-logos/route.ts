import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { approveCompanyLogo, removeCompanyLogo } from '@/lib/company-logos'
import { requireAdminId, unauthorized } from '@/lib/sync/staged-http'

/**
 * PUT approves a company's logo (and rewrites it on that company's jobs);
 * DELETE un-approves it. Service role behind the admin check: company_logos
 * has no client write policy (0040). Backs the temporary /admin/logos page.
 */
const putSchema = z.object({
  company: z.string().trim().min(1).max(200),
  link: z.string().trim().min(1).max(2000),
})

const deleteSchema = z.object({ company: z.string().trim().min(1).max(200) })

export async function PUT(request: Request) {
  const adminId = await requireAdminId()
  if (!adminId) return unauthorized()

  const parsed = putSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Send a company and a link' }, { status: 400 })

  const result = await approveCompanyLogo(createAdminClient(), parsed.data, adminId)
  if (result.ok) return NextResponse.json({ logo: result.logo, jobsUpdated: result.jobsUpdated })
  if (result.kind === 'invalid') return NextResponse.json({ error: result.message }, { status: 400 })
  console.error('Company logo approve failed:', result.message)
  return NextResponse.json({ error: 'Could not save the logo' }, { status: 500 })
}

export async function DELETE(request: Request) {
  if (!(await requireAdminId())) return unauthorized()

  const parsed = deleteSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Send a company' }, { status: 400 })

  const result = await removeCompanyLogo(createAdminClient(), parsed.data.company)
  if (result.ok) return NextResponse.json({ success: true })
  console.error('Company logo remove failed:', result.message)
  return NextResponse.json({ error: 'Could not remove the logo' }, { status: 500 })
}
