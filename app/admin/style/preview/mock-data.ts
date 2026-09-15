import type { ActionCounts, Job } from '@/lib/types'

/**
 * Fixture data for the composed-blocks preview. Never touches Supabase —
 * this page has to render the same way with the local stack down, and the
 * whole point is judging tokens against fixed, known inputs rather than
 * whatever happens to be in the dev database today.
 */

const DAY_MS = 86_400_000
const inDays = (n: number) => new Date(Date.now() + n * DAY_MS).toISOString()

export const previewJobs: Job[] = [
  {
    id: 'preview-1',
    source: 'manual',
    external_id: null,
    title: 'Marketing Intern',
    company: 'Acme Retail Co.',
    location: 'Melbourne, VIC',
    work_mode: 'hybrid',
    job_type: 'internship',
    url: 'https://acme.example/careers/intern',
    description: '<p>Support brand campaigns and social content for a growing retail team.</p>',
    summary: 'Support brand campaigns and social content for a growing retail team.',
    company_logo_url: null,
    tags: ['Brand', 'Social Media'],
    posted_at: inDays(-3),
    closing_at: inDays(5),
    is_active: true,
    is_sponsored: true,
    created_at: inDays(-3),
    updated_at: inDays(-3),
  },
  {
    id: 'preview-2',
    source: 'manual',
    external_id: null,
    title: 'Graduate Strategist',
    company: 'Northline Group',
    location: 'Sydney, NSW',
    work_mode: 'remote',
    job_type: 'graduate',
    url: 'careers@northline.example',
    description: '<p>Own quarterly strategy decks and stakeholder reporting end to end.</p>',
    summary: 'Own quarterly strategy decks and stakeholder reporting end to end.',
    company_logo_url: null,
    tags: ['Strategy', 'Analytics'],
    posted_at: inDays(-10),
    closing_at: inDays(20),
    is_active: true,
    is_sponsored: false,
    created_at: inDays(-10),
    updated_at: inDays(-10),
  },
]

export const previewActionCounts: ActionCounts = {
  view: { events: 4218, distinct_jobs: 62, visitors: 1904 },
  click: { events: 512, distinct_jobs: 40, visitors: 470 },
  apply: { events: 231, distinct_jobs: 33, visitors: 220 },
  apply_confirmed: { events: 94, distinct_jobs: 28, visitors: 94 },
  share: { events: 37, distinct_jobs: 15, visitors: 35 },
}

export const previewJobTypeChart = [
  { job_type: 'Internship', events: 182 },
  { job_type: 'Graduate', events: 146 },
  { job_type: 'Full-time', events: 98 },
  { job_type: 'Part-time', events: 61 },
  { job_type: 'Casual', events: 24 },
]

export const previewSubmissions = [
  { id: 's1', title: 'Marketing Intern', company: 'Acme Retail Co.', status: 'pending' as const },
  { id: 's2', title: 'Graduate Strategist', company: 'Northline Group', status: 'approved' as const },
  { id: 's3', title: 'Events Coordinator', company: 'Harbor & Co.', status: 'rejected' as const },
]
