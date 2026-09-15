'use client'

import { trackEvent } from '@/lib/analytics/track'
import { recordPendingApply } from '@/lib/analytics/pending-applies'
import { toApplicationHref } from '@/lib/utils'

interface ApplyLinkProps {
  jobId: string
  jobTitle: string
  jobCompany: string
  href: string
  className?: string
  children: React.ReactNode
}

/**
 * An outbound "Apply" link that records the click on the way out.
 *
 * Exists as its own client component because `app/jobs/[id]/page.tsx` is a
 * server component and cannot carry an `onClick`. The equivalent anchors inside
 * `job-detail-panel.tsx` are already in a client component and call
 * `handleApplyClick` inline instead, so their framer-motion props stay intact.
 */
export function ApplyLink({
  jobId,
  jobTitle,
  jobCompany,
  href,
  className,
  children,
}: ApplyLinkProps) {
  return (
    <a
      href={toApplicationHref(href)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => handleApplyClick({ jobId, title: jobTitle, company: jobCompany })}
      className={className}
    >
      {children}
    </a>
  )
}

/**
 * Records an apply click and queues the follow-up question.
 *
 * Two separate things, deliberately. The event is the intent — someone left for
 * the employer — and it is all this system can observe by itself. The queued
 * entry is what lets `ApplyConfirmPrompt` ask, when the visitor comes back,
 * whether the application actually happened.
 *
 * The tracker uses sendBeacon, which survives the navigation this click starts;
 * a plain fetch would be cancelled and lost.
 */
export function handleApplyClick({
  jobId,
  title,
  company,
}: {
  jobId: string
  title: string
  company: string
}): void {
  trackEvent('apply', jobId)
  recordPendingApply({ jobId, title, company, at: Date.now() })
}
