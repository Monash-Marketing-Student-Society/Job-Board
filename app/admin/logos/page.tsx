import { createServerClient } from '@/lib/supabase/server'
import { LogoApprovals } from '@/components/admin/logo-approvals'
import { buildLogoReviewRows, type ReviewApproved, type ReviewJob } from '@/lib/logo-review'
import { comparableName } from '@/lib/logos'
import { EMPLOYERS, HIDDEN_COMPANIES } from './employers'

export const metadata = {
  title: 'Logos | Admin | MMSS Job Board',
}

/**
 * Approve a logo for each allowlisted employer, each company on the board, and
 * each company waiting in a review queue. Approvals land in company_logos
 * (0040), which the sync and both approve routes read. Every job on the board
 * must have a logo (15 Oct 2026), so a queued job from a company without one
 * can't be published until it is approved here.
 *
 * Read through the admin's own session (jobs and company_logos both have
 * admin SELECT policies); writes go through /api/admin/company-logos.
 */
export default async function AdminLogosPage() {
  const supabase = await createServerClient()
  const [jobsResult, approvedResult, stagedResult, submissionsResult] = await Promise.all([
    supabase.from('jobs').select('company, company_logo_url, is_active'),
    supabase.from('company_logos').select('company_key, company, domain, logo_url, approved_at'),
    supabase.from('staged_jobs').select('normalised->>company').eq('status', 'pending'),
    supabase.from('job_submissions').select('company, company_logo_url').eq('status', 'pending'),
  ])

  if (jobsResult.error) throw new Error(`Could not load jobs: ${jobsResult.error.message}`)
  // Before 0040 is applied the table is missing; show the list with nothing approved rather than failing.
  const approved = approvedResult.error ? [] : ((approvedResult.data ?? []) as ReviewApproved[])

  const hidden = new Set(HIDDEN_COMPANIES.map(comparableName))
  // Every job needs a logo before it can be published, so companies waiting
  // in either review queue are listed too -- approve their logo here first.
  const queued: ReviewJob[] = [
    ...((stagedResult.data ?? []) as { company: string | null }[]).map((r) => ({ company: r.company ?? '', company_logo_url: null, is_active: false })),
    ...((submissionsResult.data ?? []) as { company: string; company_logo_url: string | null }[]).map((r) => ({ ...r, is_active: false })),
  ].filter((r) => r.company.trim())
  const rows = buildLogoReviewRows(EMPLOYERS, [...((jobsResult.data ?? []) as ReviewJob[]), ...queued], approved).filter(
    (r) => !hidden.has(r.key)
  )

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-[22px] font-bold text-slate-800 font-heading">Company logos</h1>
        <p className="text-sm text-slate-500 mt-1">
          Approve a logo for each company. Approving updates that company&apos;s jobs now, and every job the sync
          brings in for it later. If the suggestion is wrong, pick another, paste a link to the logo, or upload it.
        </p>
        {approvedResult.error && (
          <p className="text-sm text-destructive mt-2">
            Approvals can&apos;t be saved yet: the company_logos table is missing (migrations 0040 and 0041).
          </p>
        )}
      </div>
      <LogoApprovals rows={rows} />
    </div>
  )
}
