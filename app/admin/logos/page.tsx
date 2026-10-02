import { createServerClient } from '@/lib/supabase/server'
import { LogoApprovals } from '@/components/admin/logo-approvals'
import { buildLogoReviewRows, type ReviewApproved, type ReviewJob } from '@/lib/logo-review'
import { EMPLOYERS } from './employers'

export const metadata = {
  title: 'Logos | Admin | MMSS Job Board',
}

/**
 * TEMPORARY page (Oct 2026): approve a logo for each allowlisted employer and
 * each company on the board, in one pass. Approvals land in company_logos
 * (0040), which the sync reads, so they outlive this page. Not in the admin
 * nav; delete this folder, employers.ts and components/admin/logo-approvals.tsx
 * once the pass is done.
 *
 * Read through the admin's own session (jobs and company_logos both have
 * admin SELECT policies); writes go through /api/admin/company-logos.
 */
export default async function AdminLogosPage() {
  const supabase = await createServerClient()
  const [jobsResult, approvedResult] = await Promise.all([
    supabase.from('jobs').select('company, company_logo_url, is_active'),
    supabase.from('company_logos').select('company_key, company, domain, logo_url, approved_at'),
  ])

  if (jobsResult.error) throw new Error(`Could not load jobs: ${jobsResult.error.message}`)
  // Before 0040 is applied the table is missing; show the list with nothing approved rather than failing.
  const approved = approvedResult.error ? [] : ((approvedResult.data ?? []) as ReviewApproved[])

  const rows = buildLogoReviewRows(EMPLOYERS, (jobsResult.data ?? []) as ReviewJob[], approved)

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-[22px] font-bold text-slate-800 font-heading">Company logos</h1>
        <p className="text-sm text-slate-500 mt-1">
          Approve a logo for each company. Approving updates that company&apos;s jobs now, and every job the sync
          brings in for it later. If the suggestion is wrong, pick another or paste a Brandfetch link.
        </p>
        {approvedResult.error && (
          <p className="text-sm text-destructive mt-2">
            Approvals can&apos;t be saved yet: the company_logos table is missing (migration 0040).
          </p>
        )}
      </div>
      <LogoApprovals rows={rows} />
    </div>
  )
}
