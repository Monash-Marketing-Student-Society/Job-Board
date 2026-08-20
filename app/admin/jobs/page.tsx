import { createServerClient } from '@/lib/supabase/server'
import { JobTable } from '@/components/admin'
import { getJobStatusCounts } from '@/lib/admin-data'

export const metadata = {
  title: 'Manage Jobs | Admin | MMSS Job Board',
}

const PAGE_SIZE = 25

interface PageProps {
  searchParams: Promise<{ page?: string }>
}

export default async function AdminJobsPage({ searchParams }: PageProps) {
  const { page: pageParam } = await searchParams
  const currentPage = Math.max(1, parseInt(pageParam ?? '1', 10) || 1)
  const from = (currentPage - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  // Only the columns the table renders — `description` holds full job HTML and
  // is never shown here, so selecting it moved a large payload per row for
  // nothing. The edit page fetches the full record when it needs it.
  const supabase = await createServerClient()
  // Independent of each other — the status-tab counts are a totally separate
  // query (all rows, not just this page's), so run it alongside the page
  // fetch rather than waiting on it first.
  const [{ data: jobs, count }, counts] = await Promise.all([
    supabase
      .from('jobs')
      .select(
        'id, title, company, source, is_active, is_sponsored, posted_at, created_at',
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(from, to),
    getJobStatusCounts().catch(() => null),
  ])

  const totalPages = Math.ceil((count ?? 0) / PAGE_SIZE)

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-[22px] font-bold text-slate-800 font-heading">
          Manage Jobs
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Create, edit, and manage job listings
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <JobTable
          jobs={jobs ?? []}
          totalJobs={count ?? 0}
          currentPage={currentPage}
          totalPages={totalPages}
          counts={counts ?? undefined}
        />
      </div>
    </div>
  )
}
