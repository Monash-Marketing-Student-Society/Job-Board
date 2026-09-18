'use client'

import { JobDetailPanel } from '@/components/jobs/job-detail-panel'
import type { Job } from '@/lib/types'

/**
 * Client boundary around JobDetailPanel for the draft preview.
 *
 * Not decoration: the panel's entry animations (framer-motion `initial` →
 * `animate`) never fired when a server component rendered it directly, so
 * the title, pills and description stayed at their initial `opacity: 0` and
 * the panel came up blank. Both public usages (app/page.tsx, app/jobs/page.tsx)
 * mount it from inside a client component, and mounting it the same way here
 * makes it animate in identically.
 */
export function DraftPreview({ job }: { job: Job }) {
  return <JobDetailPanel job={job} isMainView preview />
}
