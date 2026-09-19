'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { JobDetailPanel } from '@/components/jobs/job-detail-panel'
import { JobsHeader } from '@/components/jobs/jobs-header'
import { JobCard } from '@/components/jobs/job-card'
import { ApplyConfirmPrompt } from '@/components/jobs/apply-confirm-prompt'
import { trackEvent } from '@/lib/analytics/track'
import { useDwellTracking } from '@/hooks/use-dwell-tracking'
import type { Job } from '@/lib/types'

const JOBS_PER_PAGE = 25

export default function HomePage() {
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
  const [showDetail, setShowDetail] = useState(false)
  const [linkedJobId, setLinkedJobId] = useState<string | null>(null)
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
      const from = (currentPage - 1) * JOBS_PER_PAGE
      const to = from + JOBS_PER_PAGE - 1
      const { data, count } = await applySearchFilters(
        supabase.from('jobs').select('*', { count: 'exact' })
          .eq('is_sponsored', true)
          .order('posted_at', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false })
          .range(from, to)
      )
      if (data) {
        setJobs(data as Job[])
        setTotalJobs(count || 0)
        setSelectedJob(data.length > 0 ? data[0] as Job : null)
      }
    } else {
      // Sponsored jobs pinned to top, then paginated active non-sponsored jobs
      const from = (currentPage - 1) * JOBS_PER_PAGE
      const to = from + JOBS_PER_PAGE - 1
      const [{ data: sponsored }, { data: regular, count }] = await Promise.all([
        applySearchFilters(
          supabase.from('jobs').select('*')
            .eq('is_sponsored', true)
            .order('posted_at', { ascending: false, nullsFirst: false })
            .order('created_at', { ascending: false })
        ),
        applySearchFilters(
          supabase.from('jobs').select('*', { count: 'exact' })
            .eq('is_active', true)
            .eq('is_sponsored', false)
            .order('posted_at', { ascending: false, nullsFirst: false })
            .order('created_at', { ascending: false })
            .range(from, to)
        ),
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
  }, [filters.search, filters.job_type, filters.work_mode])

  // Read ?job=<id> from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const jobId = params.get('job')
    if (jobId) setLinkedJobId(jobId)
  }, [])

  // Once jobs load, pre-select the linked job
  //
  // Arriving on a shared ?job= link counts as a view even though no card was
  // clicked — that link is exactly what the Share button produces, so counting
  // it is what makes shares legible against the views they generate.
  //
  // The plain first-job auto-selection in fetchJobs is deliberately NOT tracked:
  // nobody asked to see that job, and counting it would credit whatever happens
  // to sort first with a view on every single page load.
  useEffect(() => {
    if (!linkedJobId || isLoading) return
    const found = jobs.find(j => j.id === linkedJobId)
    if (found) {
      setSelectedJob(found)
      setShowDetail(true)
      setLinkedJobId(null)
      trackEvent('view', found.id)
      setOpenedJobId(found.id)
    } else {
      // Job not in current page — fetch it directly and show in the panel
      const supabase = createClient()
      supabase.from('jobs').select('*').eq('id', linkedJobId).single().then(({ data }) => {
        if (data) {
          setSelectedJob(data as Job)
          setShowDetail(true)
          trackEvent('view', (data as Job).id)
          setOpenedJobId((data as Job).id)
        }
        setLinkedJobId(null)
      })
    }
  }, [jobs, linkedJobId, isLoading])

  useDwellTracking(openedJobId)

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  const handleJobSelect = (job: Job) => {
    setSelectedJob(job)
    setShowDetail(true)
    // A click and a view are recorded separately: the click is the card press,
    // the view is the detail panel it opens. They diverge for shared links,
    // which produce a view with no click (see the ?job= effect above).
    trackEvent('click', job.id)
    trackEvent('view', job.id)
    setOpenedJobId(job.id)
  }

  const handleBack = () => {
    setShowDetail(false)
    // Closing the panel ends the reading stretch, so the dwell measurement is
    // sent here rather than waiting for the next listing or the page unload.
    setOpenedJobId(null)
  }

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
  }

  return (
    <>
    <div className="h-[calc(100vh-80px)] bg-[#e8e8e8] flex flex-col overflow-hidden">
      {/* Header - fixed at top */}
      <JobsHeader
        totalJobs={totalJobs}
        lastUpdated={jobs[0]?.posted_at || jobs[0]?.created_at || null}
        filters={filters}
        onFilterChange={handleFilterChange}
        onSponsoredToggle={() => setFilters(prev => ({ ...prev, sponsored: !prev.sponsored }))}
      />

      {/* Two-panel layout fills remaining height */}
      <div className="flex-1 flex px-4 sm:px-6 md:px-8 lg:px-12 pb-4 pt-2 gap-5 max-w-[1200px] mx-auto w-full min-h-0">
        {/* Mobile: animated view switching */}
        <div className="flex-1 flex md:hidden min-h-0 relative">
          <AnimatePresence mode="wait" initial={false}>
            {!showDetail ? (
              <motion.div
                key="mobile-list"
                className="w-full flex flex-col min-h-0 absolute inset-0"
                initial={{ opacity: 0, x: -40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -40 }}
                transition={{ type: 'spring', stiffness: 400, damping: 32 }}
              >
                <div data-lenis-prevent data-job-feed className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-1 min-h-0">
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
                  <div className="flex items-center justify-center gap-2 py-3 shrink-0 border-t border-slate-200/50">
                    <button
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                      className="px-3 py-1.5 text-xs text-slate-600 bg-white border border-slate-200 rounded-full hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Prev
                    </button>
                    <span className="text-xs text-slate-500">
                      {currentPage} / {totalPages}
                    </span>
                    <button
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      className="px-3 py-1.5 text-xs text-slate-600 bg-white border border-slate-200 rounded-full hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                )}
              </motion.div>
            ) : selectedJob ? (
              <motion.div
                key="mobile-detail"
                className="w-full flex flex-col min-h-0 absolute inset-0"
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 40 }}
                transition={{ type: 'spring', stiffness: 400, damping: 32 }}
              >
                <JobDetailPanel job={selectedJob} isMainView onBack={handleBack} />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        {/* Desktop: side-by-side panels */}
        <div className="hidden md:flex md:w-[380px] md:shrink-0 flex-col min-h-0">
          <div data-lenis-prevent data-job-feed className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-1 min-h-0">
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
            <div className="flex items-center justify-center gap-2 py-3 shrink-0 border-t border-slate-200/50">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="px-3 py-1.5 text-xs text-slate-600 bg-white border border-slate-200 rounded-full hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Prev
              </button>
              <span className="text-xs text-slate-500">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 text-xs text-slate-600 bg-white border border-slate-200 rounded-full hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          )}
        </div>

        {/* Desktop: Right Panel */}
        <div className="hidden md:block flex-1 min-w-0 min-h-0">
          <AnimatePresence mode="wait">
            {selectedJob ? (
              <motion.div
                key={selectedJob.id}
                className="h-full"
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
              <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400 h-full flex items-center justify-center">
                Select a job to view details
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Asks returning visitors whether an apply click became a real
          application — the only application signal this board can observe,
          since applying itself happens on the employer's site. */}
      <ApplyConfirmPrompt />
    </div>

    {/* Asks returning visitors whether an apply click became a real
        application — the only application signal this board can observe,
        since applying itself happens on the employer's site.
        Deliberately outside the overflow-hidden shell above: nesting a
        `fixed` element inside an `overflow: hidden` ancestor is a known
        iOS Safari trap — the element can get clipped/trapped by that
        ancestor's bounds there even though desktop browsers render it
        correctly fixed to the true viewport regardless of nesting. */}
    <ApplyConfirmPrompt />
    </>
  )
}
