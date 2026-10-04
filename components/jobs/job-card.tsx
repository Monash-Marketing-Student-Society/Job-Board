'use client'

import { motion } from 'framer-motion'
import { formatDate, truncateText } from '@/lib/utils'
import { sourceAttribution } from '@/lib/job-attribution'
import type { Job } from '@/lib/types'

interface JobCardProps {
  job: Job
  isSelected: boolean
  onClick: () => void
}

export function JobCard({ job, isSelected, onClick }: JobCardProps) {
  const attribution = sourceAttribution(job.source)

  const getInitials = (company: string) => {
    return company
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  const formatJobType = (type: string | null) => {
    if (!type) return ''
    return type.charAt(0).toUpperCase() + type.slice(1).replace('-', ' ')
  }

  const stripHtml = (html: string) => {
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  }

  const truncateDescription = (desc: string | null, maxLength: number = 100) => {
    if (!desc) return null
    return truncateText(stripHtml(desc), maxLength)
  }

  const expiryDate = (() => {
    if (!job.closing_at) return null
    const closing = new Date(job.closing_at)
    const daysUntil = Math.ceil((closing.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    if (daysUntil <= 7 && daysUntil >= 0) {
      return daysUntil === 0 ? 'Closes today' : `Closing in ${daysUntil} day${daysUntil === 1 ? '' : 's'}`
    }
    return `Closes ${closing.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}`
  })()

  const tags = [
    job.job_type ? formatJobType(job.job_type) : null,
    job.work_mode ? job.work_mode.charAt(0).toUpperCase() + job.work_mode.slice(1) : null,
    job.location ? (job.location.length > 20 ? job.location.substring(0, 20) + '...' : job.location) : null,
  ].filter(Boolean)

  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.98 }}
      whileHover={{ scale: 1.01 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      className={`w-full text-left p-4 rounded-xl transition-all border ${
        isSelected
          ? 'bg-white border-slate-300 shadow-sm'
          : 'bg-[#f2f2f2] hover:bg-white border-transparent hover:border-slate-200'
      }`}
    >
      <div className="flex gap-3">
        {/* Company Logo/Initials */}
        {job.company_logo_url ? (
          <img
            src={job.company_logo_url}
            alt={job.company}
            className="w-10 h-10 rounded-lg object-contain shrink-0 border border-slate-200 bg-white"
          />
        ) : (
          <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center text-xs font-semibold text-purple-700 shrink-0">
            {getInitials(job.company)}
          </div>
        )}

        {/* Job Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-semibold text-sm leading-tight text-slate-900 truncate">
                {job.title}
              </h3>
              <p className="text-xs mt-0.5 text-slate-500">
                {job.company}
                {attribution && <span className="text-slate-400"> · {attribution}</span>}
              </p>
            </div>
            {expiryDate && (
              <span className="text-[11px] text-slate-400 shrink-0 mt-0.5">
                {expiryDate}
              </span>
            )}
          </div>

          {/* Description Preview — prefer the short card summary (AI-suggested
              on submission or hand-written by an admin) over a truncated cut
              of the full description, which reads worse the longer the
              source text runs. */}
          {(job.summary || job.description) && (
            <p className="text-xs mt-1.5 leading-relaxed line-clamp-2 text-slate-400">
              {job.summary || truncateDescription(job.description, 120)}
            </p>
          )}

          {/* Tags with stagger */}
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            {job.is_sponsored && (
              <motion.span
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                className="text-[11px] px-2 py-0.5 rounded-full bg-primary text-white font-semibold"
              >
                Sponsored
              </motion.span>
            )}
            {tags.map((tag, i) => (
              <motion.span
                key={tag}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.05, type: 'spring', stiffness: 500, damping: 25 }}
                className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200"
              >
                {tag}
              </motion.span>
            ))}
          </div>
        </div>
      </div>
    </motion.button>
  )
}
