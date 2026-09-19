import type { MetricTile } from '@/lib/analytics/metrics'
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
  dwell: { events: 2860, distinct_jobs: 58, visitors: 1420 },
}

/**
 * Tiles for the metric-card block.
 *
 * Hand-written rather than derived from `previewActionCounts`: the tiles carry
 * a movement figure and a daily shape, and the preview exists to judge how
 * those look at their extremes — a rising series, a falling one, and a figure
 * with no honest comparison at all — not to re-derive numbers the dashboard
 * already derives from the database.
 */
export const previewMetricTiles: MetricTile[] = [
  {
    key: 'preview-viewers',
    label: 'Distinct viewers',
    value: 1904,
    format: 'count',
    series: [],
    trend: { changePct: null, direction: 'insufficient' },
    note: 'Unique visitors over the period — not the sum of the daily counts',
  },
  {
    key: 'preview-views',
    label: 'Job views',
    value: 4218,
    format: 'count',
    series: [38, 41, 36, 52, 47, 58, 61, 55, 67, 64, 72, 69, 78, 83],
    trend: { changePct: 44.6, direction: 'up' },
  },
  {
    key: 'preview-depth',
    label: 'Views per viewer',
    value: 2.2,
    format: 'decimal',
    series: [1.8, 2.1, 1.9, 2.4, 2.2, 2.0, 2.3, 2.6, 2.2, 2.4, 2.1, 2.3, 2.5, 2.2],
    trend: { changePct: 0, direction: 'flat' },
    note: 'How many listings a viewer opens on an average day',
  },
  {
    key: 'preview-applications',
    label: 'Applications',
    value: 94,
    format: 'count',
    series: [12, 11, 13, 9, 10, 8, 9, 7, 8, 6, 7, 5, 6, 4],
    trend: { changePct: -18.4, direction: 'down' },
    note: 'Self-reported on return — a floor, not a total',
  },
]

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
