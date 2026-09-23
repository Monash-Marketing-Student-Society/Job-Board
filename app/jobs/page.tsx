'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { liveJobs } from '@/lib/jobs-query'
import { JobDetailPanel } from '@/components/jobs/job-detail-panel'
import { JobsHeader } from '@/components/jobs/jobs-header'
import { JobCard } from '@/components/jobs/job-card'
import { ApplyConfirmPrompt } from '@/components/jobs/apply-confirm-prompt'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { trackEvent } from '@/lib/analytics/track'
import { useDwellTracking } from '@/hooks/use-dwell-tracking'
import type { Job } from '@/lib/types'

const JOBS_PER_PAGE = 25

/**
 * Shared by the two filters. Sides are padded separately to clear the chevron.
 *
 * Background/border/ring-width now come from `NativeSelect`'s own palette
 * (matched to `components/shadcn/select.tsx`) rather than being repeated
 * here — only the brand-primary focus color stays as an explicit override,
 * a deliberate difference from the header's slate-toned `FILTER_PILL`
 * (see `components/jobs/jobs-header.tsx`), not something to reconcile away.
 *
 * Focus rules use `focus-visible:` to match the variant the component's own
 * ring uses — a `focus:` override would not replace it, it would draw on top
 * of it, leaving two rings and an offset halo.
 */
const FILTER_FIELD =
  'h-9 pl-3 pr-8 text-sm rounded-lg ' +
  'focus-visible:ring-primary/20 focus-visible:border-primary cursor-pointer'

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)
  // The listing the visitor actually opened, as opposed to the one the board
  // happens to be showing: `selectedJob` is auto-filled with the first result
  // on every load, and timing that panel would credit whatever sorts first
  // with every idle minute anyone spends on the page. Set in exactly the two
  // places a `view` is recorded.
  const [openedJobId, setOpenedJobId] = useState<string | null>(null)
  const [totalJobs, setTotalJobs] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [filters, setFilters] = useState({
    search: '',
    job_type: '',
    work_mode: '',
    location: '',
    sponsored: false,
  })

  const totalPages = Math.ceil(totalJobs / JOBS_PER_PAGE)

  const fetchJobs = useCallback(async () => {
    setIsLoading(true)
    const supabase = createClient()

    const applySearchFilters = (q: any) => { // eslint-disable-line
      if (filters.search) q = q.or(`title.ilike.%${filters.search}%,company.ilike.%${filters.search}%`)
      if (filters.job_type) q = q.eq('job_type', filters.job_type)
      if (filters.work_mode) q = q.eq('work_mode', filters.work_mode)
      return q
    }

    if (filters.sponsored) {
      // Sponsored-only view
      const from = (currentPage - 1) * JOBS_PER_PAGE
      const to = from + JOBS_PER_PAGE - 1
      const query = applySearchFilters(
        liveJobs(supabase.from('jobs').select('*', { count: 'exact' }))
          .eq('is_sponsored', true)
          .order('posted_at', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false })
          .range(from, to)
      )
      const { data, count } = await query
      if (data) {
        setJobs(data as Job[])
        setTotalJobs(count || 0)
        setSelectedJob(data.length > 0 ? data[0] as Job : null)
      }
    } else {
      // Fetch sponsored jobs separately — always pinned to top
      const sponsoredQuery = applySearchFilters(
        liveJobs(supabase.from('jobs').select('*'))
          .eq('is_sponsored', true)
          .order('posted_at', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false })
      )

      // Paginated non-sponsored active jobs
      const from = (currentPage - 1) * JOBS_PER_PAGE
      const to = from + JOBS_PER_PAGE - 1
      const regularQuery = applySearchFilters(
        liveJobs(supabase.from('jobs').select('*', { count: 'exact' }))
          .eq('is_sponsored', false)
          .order('posted_at', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false })
          .range(from, to)
      )

      const [{ data: sponsored }, { data: regular, count }] = await Promise.all([
        sponsoredQuery,
        regularQuery,
      ])

      const combined = [...(sponsored as Job[] ?? []), ...(regular as Job[] ?? [])]
      setJobs(combined)
      setTotalJobs((sponsored?.length ?? 0) + (count ?? 0))
      setSelectedJob(combined.length > 0 ? combined[0] : null)
    }

    setIsLoading(false)
  }, [filters, currentPage])

  useEffect(() => {
    fetchJobs()
  }, [fetchJobs])

  useEffect(() => {
    setCurrentPage(1)
  }, [filters.search, filters.job_type, filters.work_mode, filters.sponsored])

  const handleSponsoredToggle = () => {
    setFilters(prev => ({ ...prev, sponsored: !prev.sponsored }))
  }

  useDwellTracking(openedJobId)

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  const handleJobSelect = (job: Job) => {
    setSelectedJob(job)
    // Duplicated from app/page.tsx on purpose — these two pages are knowingly
    // near-identical copies, and unifying them is out of scope here.
    trackEvent('click', job.id)
    trackEvent('view', job.id)
    setOpenedJobId(job.id)
  }

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="flex flex-col min-w-0">
        <JobsHeader
          totalJobs={totalJobs}
          filters={filters}
          onFilterChange={handleFilterChange}
          onSponsoredToggle={handleSponsoredToggle}
        />

        <div className="flex-1 flex px-8 lg:px-12 pb-6 pt-4 gap-6 max-w-[1600px] mx-auto w-full items-start">
          {/* Left Panel - Job Cards */}
          <div className="w-[420px] shrink-0">
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <NativeSelect
                value={filters.job_type}
                onChange={(e) => handleFilterChange('job_type', e.target.value)}
                className={FILTER_FIELD}
              >
                <NativeSelectOption value="">All Categories</NativeSelectOption>
                <NativeSelectOption value="internship">Internship</NativeSelectOption>
                <NativeSelectOption value="graduate">Graduate</NativeSelectOption>
                <NativeSelectOption value="part-time">Part-time</NativeSelectOption>
                <NativeSelectOption value="full-time">Full-time</NativeSelectOption>
                <NativeSelectOption value="casual">Casual</NativeSelectOption>
                <NativeSelectOption value="contract">Contract</NativeSelectOption>
              </NativeSelect>
              <NativeSelect
                value={filters.work_mode}
                onChange={(e) => handleFilterChange('work_mode', e.target.value)}
                className={FILTER_FIELD}
              >
                <NativeSelectOption value="">All Locations</NativeSelectOption>
                <NativeSelectOption value="remote">Remote</NativeSelectOption>
                <NativeSelectOption value="hybrid">Hybrid</NativeSelectOption>
                <NativeSelectOption value="onsite">On-site</NativeSelectOption>
              </NativeSelect>
              <button
                onClick={handleSponsoredToggle}
                className={`h-9 px-4 text-sm font-medium rounded-lg transition-all ${
                  filters.sponsored
                    ? 'bg-primary text-white shadow-sm'
                    : 'bg-primary/10 text-primary hover:bg-primary/20'
                }`}
              >
                Sponsored
              </button>
            </div>

            <div data-job-feed className="space-y-3">
              {isLoading ? (
                <div className="bg-white rounded-xl p-8 text-center text-slate-500">
                  <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-3 animate-spin" />
                  Loading jobs...
                </div>
              ) : jobs.length === 0 ? (
                <div className="bg-white rounded-xl p-8 text-center text-slate-500">
                  No jobs found
                </div>
              ) : (
                jobs.map((job) => (
                  <JobCard
                    key={job.id}
                    job={job}
                    isSelected={selectedJob?.id === job.id}
                    onClick={() => handleJobSelect(job)}
                  />
                ))
              )}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-4 pt-4 border-t border-slate-200">
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 text-sm text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Prev
                </button>
                <span className="text-sm text-slate-600">
                  {currentPage} / {totalPages}
                </span>
                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 text-sm text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            )}
          </div>

          {/* Right Panel - Job Details (Main Visual) */}
          <div className="flex-1 min-w-0 self-start sticky top-24">
            <AnimatePresence mode="wait">
              {selectedJob ? (
                <motion.div
                  key={selectedJob.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{
                    type: 'spring',
                    stiffness: 500,
                    damping: 35
                  }}
                >
                  <JobDetailPanel job={selectedJob} isMainView />
                </motion.div>
              ) : (
                <div className="bg-white rounded-2xl shadow-sm p-12 text-center text-slate-400">
                  Select a job to view details
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <ApplyConfirmPrompt />
    </div>
  )
}
