'use client'

import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { sanitizeDescription } from '@/lib/sanitize'
import { trackEvent } from '@/lib/analytics/track'
import { handleApplyClick } from './apply-link'
import type { Job } from '@/lib/types'

interface JobDetailPanelProps {
  job: Job
  isMainView?: boolean
  onBack?: () => void
}

const pillVariants = {
  initial: { opacity: 0, y: 8, scale: 0.9 },
  animate: { opacity: 1, y: 0, scale: 1 },
}

export function JobDetailPanel({ job, isMainView = false, onBack }: JobDetailPanelProps) {
  const [copied, setCopied] = useState(false)

  // Memoised on the description itself: this panel re-renders on every
  // selection change and animation tick, and re-parsing the HTML each time
  // would be wasted work.
  const safeDescription = useMemo(
    () => sanitizeDescription(job.description),
    [job.description]
  )

  const getInitials = (company: string) => {
    return company
      .split(' ')
      .map(word => word[0])
      .join('')
      .substring(0, 2)
      .toUpperCase()
  }

  const pills = [
    job.location ? { key: 'location', icon: 'location', label: job.location } : null,
    job.job_type ? { key: 'type', label: job.job_type.charAt(0).toUpperCase() + job.job_type.slice(1).replace('-', ' ') } : null,
    job.work_mode ? { key: 'mode', icon: job.work_mode, label: job.work_mode.charAt(0).toUpperCase() + job.work_mode.slice(1) } : null,
    ...(job.tags || []).map(tag => ({ key: `tag-${tag}`, label: tag })),
  ].filter(Boolean) as { key: string; icon?: string; label: string }[]

  if (isMainView) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col h-full">
        {/* Header */}
        <div className="p-4 sm:p-6 pb-4">
          {/* Mobile back button */}
          {onBack && (
            <motion.button
              onClick={onBack}
              whileTap={{ x: -4 }}
              transition={{ type: 'spring', stiffness: 500, damping: 20 }}
              className="md:hidden flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-3 -ml-0.5 transition-colors"
            >
              <motion.svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                animate={{ x: [0, -3, 0] }}
                transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut', repeatDelay: 2 }}
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </motion.svg>
              Back to jobs
            </motion.button>
          )}
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <motion.h1
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                className="text-lg sm:text-xl font-bold text-slate-900 leading-tight"
              >
                {job.title}
              </motion.h1>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.05 }}
                className="text-sm text-slate-500 mt-1"
              >
                {job.company}
              </motion.p>
            </div>
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 20, delay: 0.1 }}
            >
              {job.company_logo_url ? (
                <img
                  src={job.company_logo_url}
                  alt={job.company}
                  className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl object-contain shrink-0 border border-slate-200 bg-white"
                />
              ) : (
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-purple-100 flex items-center justify-center text-xs sm:text-sm font-semibold text-purple-700 shrink-0 border border-purple-200">
                  {getInitials(job.company)}
                </div>
              )}
            </motion.div>
          </div>

          {/* Info pills row - staggered */}
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            {pills.map((pill, i) => (
              <motion.span
                key={pill.key}
                variants={pillVariants}
                initial="initial"
                animate="animate"
                transition={{ delay: 0.1 + i * 0.05, type: 'spring', stiffness: 400, damping: 22 }}
                className="inline-flex items-center text-xs px-3 py-1 rounded-full border border-slate-200 bg-slate-50 text-slate-600"
              >
                {pill.icon === 'location' && <LocationIcon className="w-3 h-3 mr-1.5" />}
                {pill.icon === 'remote' && <RemoteIcon className="w-3 h-3 mr-1.5" />}
                {pill.icon === 'hybrid' && <HybridIcon className="w-3 h-3 mr-1.5" />}
                {pill.icon === 'onsite' && <OnsiteIcon className="w-3 h-3 mr-1.5" />}
                {pill.label}
              </motion.span>
            ))}
          </div>
        </div>

        {/* Description - scrollable */}
        <div data-lenis-prevent className="px-4 sm:px-6 pb-6 flex-1 overflow-y-auto custom-scrollbar min-h-0">
          {job.description ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.15 }}
            >
              <h2 className="text-sm font-semibold text-slate-800 mb-2">Job Description</h2>
              <div
                className="prose prose-sm max-w-none text-slate-600 prose-headings:text-slate-800 prose-a:text-primary prose-img:rounded-lg"
                dangerouslySetInnerHTML={{ __html: safeDescription }}
              />
            </motion.div>
          ) : (
            <div className="text-center py-8">
              <p className="text-slate-500 text-sm">
                No description available for this role.
              </p>
              <a
                href={job.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => handleApplyClick({ jobId: job.id, title: job.title, company: job.company })}
                className="inline-flex items-center text-primary font-medium text-sm mt-2 hover:underline"
              >
                View full details on company website
                <svg className="w-3.5 h-3.5 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          )}

        </div>

        {/* Sticky Apply Button */}
        <div className="p-3 sm:p-4 border-t border-slate-200 bg-white flex gap-3">
          <motion.a
            href={job.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => handleApplyClick({ jobId: job.id, title: job.title, company: job.company })}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 500, damping: 25 }}
            className="flex-1 bg-primary hover:bg-primary/90 text-white font-medium py-2.5 px-6 rounded-xl text-center transition-colors text-sm inline-flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Apply Now
          </motion.a>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.93 }}
            transition={{ type: 'spring', stiffness: 500, damping: 25 }}
            onClick={() => {
              // Tracked before the copy: `writeText` can reject (or throw
              // outright) when the document isn't focused or the API is
              // unavailable, and a share the visitor intended shouldn't go
              // uncounted because the clipboard was unavailable.
              trackEvent('share', job.id)
              navigator.clipboard.writeText(`${window.location.origin}/?job=${job.id}`)
              setCopied(true)
              setTimeout(() => setCopied(false), 2000)
            }}
            className={`px-4 py-2.5 rounded-xl border transition-all text-sm inline-flex items-center gap-2 ${
              copied
                ? 'border-green-300 bg-green-50 text-green-700'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <AnimatePresence mode="wait">
              {copied ? (
                <motion.svg
                  key="check"
                  initial={{ scale: 0, rotate: -90 }}
                  animate={{ scale: 1, rotate: 0 }}
                  exit={{ scale: 0 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </motion.svg>
              ) : (
                <motion.svg
                  key="copy"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                </motion.svg>
              )}
            </AnimatePresence>
            <span className="hidden sm:inline">{copied ? 'Copied!' : 'Share'}</span>
          </motion.button>
        </div>
      </div>
    )
  }

  // Compact sidebar view (fallback)
  return (
    <div className="bg-white rounded-2xl border border-slate-200 h-full flex flex-col overflow-hidden">
      <div className="p-6 text-center border-b border-slate-100">
        <div className="w-14 h-14 rounded-xl mx-auto mb-3 flex items-center justify-center bg-purple-100 text-purple-700 font-semibold text-lg border border-purple-200">
          {getInitials(job.company)}
        </div>
        <h2 className="text-lg font-semibold text-slate-800">{job.company}</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        <h3 className="font-semibold text-slate-800">{job.title}</h3>
        <p className="text-sm text-slate-500 mt-1">{job.location || 'Location not specified'}</p>
        {job.description && (
          <p className="text-sm text-slate-600 leading-relaxed mt-4">
            {job.description.substring(0, 300)}
            {job.description.length > 300 && '...'}
          </p>
        )}
      </div>
      <div className="p-4 border-t border-slate-200 flex gap-3">
        <a
          href={job.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => handleApplyClick({ jobId: job.id, title: job.title, company: job.company })}
          className="flex-1 bg-primary hover:bg-primary/90 text-white font-medium py-2.5 px-4 rounded-xl text-center transition-colors text-sm"
        >
          Apply Now
        </a>
      </div>
    </div>
  )
}

function RemoteIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  )
}

function HybridIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  )
}

function OnsiteIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  )
}

function LocationIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="m9.69 18.933.003.001C9.89 19.02 10 19 10 19s.11.02.308-.066l.002-.001.006-.003.018-.008a5.741 5.741 0 0 0 .281-.14c.186-.096.446-.24.757-.433.62-.384 1.445-.966 2.274-1.765C15.302 14.988 17 12.493 17 9A7 7 0 1 0 3 9c0 3.492 1.698 5.988 3.355 7.584a13.731 13.731 0 0 0 2.273 1.765 11.842 11.842 0 0 0 .976.544l.062.029.018.008.006.003ZM10 11.25a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5Z"
        clipRule="evenodd"
      />
    </svg>
  )
}
