'use client'

import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, XAxis } from 'recharts'
import {
  Button,
  Input,
  Textarea,
  NativeSelect,
  NativeSelectOption,
  Label,
  Badge,
  Alert,
  AlertTitle,
  AlertDescription,
  TagCombobox,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  type SelectOption,
} from '@/components/ui'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { AdminPagination, GridRow, StatusDot, type StatusDotRole } from '@/components/admin/table'
import { MetricCards } from '@/components/admin/analytics/metric-cards'
import { JobCard } from '@/components/jobs/job-card'
import { cn } from '@/lib/utils'
import { toJobFunctions, type JobFunction } from '@/lib/tags'
import { previewJobs, previewMetricTiles, previewJobTypeChart, previewSubmissions } from './mock-data'
import { BorderComparison } from './border-comparison'
import { UndocumentedBlock, UtilityLayerBlock } from './undocumented'
import { Usage } from '../components/usage'
import { Panel } from '../components/shell'

const JOB_TYPE_OPTIONS: SelectOption[] = [
  { value: '', label: 'Select job type' },
  { value: 'internship', label: 'Internship' },
  { value: 'graduate', label: 'Graduate' },
  { value: 'full-time', label: 'Full-time' },
]

const SUBMISSION_STATUS_ROLE: Record<(typeof previewSubmissions)[number]['status'], StatusDotRole> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'destructive',
}

const chartConfig = {
  events: {
    label: 'Interactions',
    color: 'var(--graph-mark, #8367a3)',
  },
} satisfies ChartConfig

function Swatch({
  label,
  className,
  textClassName = 'text-foreground',
  style,
}: {
  label: string
  className?: string
  textClassName?: string
  style?: React.CSSProperties
}) {
  return (
    <div
      className={cn(
        'flex h-16 flex-col justify-end rounded-lg border border-border p-2',
        className
      )}
      style={style}
    >
      <span className={cn('text-[11px] font-medium leading-tight', textClassName)}>{label}</span>
    </div>
  )
}

export function ThemePreviewClient() {
  const [selectedJobId, setSelectedJobId] = useState(previewJobs[0].id)
  const [formTags, setFormTags] = useState<JobFunction[]>(toJobFunctions(['Brand', 'Social Media']))

  return (
    <div className="space-y-8 pb-24">
      <header className="mb-6 space-y-1">
        <h1 className="text-2xl font-semibold text-slate-900">Preview</h1>
        <p className="text-[13px] text-slate-500">
          Real components, composed. Fixture data only.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {/* Border treatments — full width and first, because it is an open
            question the user is choosing between, not settled documentation
            like everything below it. */}
        <Panel
          title="Border treatments"
          description="The same screen in each treatment. Compare columns, not edges."
          className="xl:col-span-2"
        >
          <BorderComparison />
        </Panel>

        {/* Previously undocumented — see undocumented.tsx. */}
        <Panel
          title="Not previously documented"
          description="Components and global styles neither page covered."
          className="xl:col-span-2"
        >
          <UndocumentedBlock />
        </Panel>

        <Panel
          title="The @utility layer"
          description="A second button and card system in globals.css that no component imports."
          className="xl:col-span-2"
        >
          <UtilityLayerBlock />
        </Panel>

        {/* Palette — full width, first, everything else is built from these. */}
        <Panel title="Palette" className="xl:col-span-2">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            <Swatch label="background" className="bg-background" />
            <Swatch label="foreground" className="bg-foreground" textClassName="text-background" />
            <Swatch label="primary" className="bg-primary" textClassName="text-primary-foreground" />
            <Swatch label="secondary" className="bg-secondary" textClassName="text-secondary-foreground" />
            <Swatch label="muted" className="bg-muted" textClassName="text-muted-foreground" />
            <Swatch label="accent" className="bg-accent" textClassName="text-accent-foreground" />
            <Swatch label="border" className="bg-border" />
            <Swatch label="success" className="bg-success" textClassName="text-success-foreground" />
            <Swatch label="warning" className="bg-warning" textClassName="text-warning-foreground" />
            <Swatch label="destructive" className="bg-destructive" textClassName="text-destructive-foreground" />
            {[1, 2].map((n) => (
              <Swatch
                key={n}
                label={`chart-${n}`}
                textClassName="text-white"
                style={{ backgroundColor: `var(--chart-${n})` }}
              />
            ))}
          </div>
        </Panel>

        {/* Typography */}
        <Panel title="Typography" className="xl:col-span-2">
          <div className="space-y-3">
            <p className="font-heading text-3xl font-bold leading-tight text-foreground">
              Marketing Intern
            </p>
            <p className="font-heading text-base font-semibold text-foreground">
              Acme Retail Co. · Melbourne, VIC
            </p>
            <p className="text-sm leading-relaxed text-foreground">
              Body copy at the size used across job descriptions and card summaries — enough weight
              to read as content, not a caption, next to the muted line below it.
            </p>
            <p className="text-xs text-muted-foreground">
              Closing in 5 days · posted 3 days ago
            </p>
          </div>
        </Panel>

        {/* Real job cards, side by side, one selected */}
        <Panel title="Job card" description="Unmodified" className="xl:col-span-2">
          <div className="space-y-2">
            <Usage file="components/jobs/job-card.tsx" />
            {previewJobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                isSelected={job.id === selectedJobId}
                onClick={() => setSelectedJobId(job.id)}
              />
            ))}
          </div>
        </Panel>

        {/* Buttons & badges */}
        <Panel title="Buttons & badges">
          <div className="space-y-4">
            <Usage file="components/ui/button.tsx" />
            <div className="flex flex-wrap gap-2">
              <Button size="sm">Primary</Button>
              <Button size="sm" variant="secondary">Secondary</Button>
              <Button size="sm" variant="outline">Outline</Button>
              <Button size="sm" variant="ghost">Ghost</Button>
              <Button size="sm" variant="destructive">Destructive</Button>
              <Button size="sm" variant="link">Link</Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge>Default</Badge>
              <Badge variant="secondary">Secondary</Badge>
              <Badge variant="outline">Outline</Badge>
              <Badge variant="success">Success</Badge>
              <Badge variant="warning">Warning</Badge>
              <Badge variant="destructive">Destructive</Badge>
            </div>
          </div>
        </Panel>

        {/* Alerts */}
        <Panel title="Alerts">
          <div className="space-y-2.5">
            <Alert>
              <AlertTitle>Heads up</AlertTitle>
              <AlertDescription>Neutral informational message.</AlertDescription>
            </Alert>
            <Alert variant="success">
              <AlertTitle>Approved</AlertTitle>
              <AlertDescription>Submission approved and published.</AlertDescription>
            </Alert>
            <Alert variant="warning">
              <AlertTitle>Closing soon</AlertTitle>
              <AlertDescription>Application closes within 3 days.</AlertDescription>
            </Alert>
            <Alert variant="destructive">
              <AlertTitle>Failed to save</AlertTitle>
              <AlertDescription>Check the required fields and try again.</AlertDescription>
            </Alert>
          </div>
        </Panel>

        {/* Form panel — same primitives as the submit/admin job forms */}
        <Panel title="Form" description="The submit and admin job forms" className="xl:col-span-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="preview-title" required>Job title</Label>
              <Input id="preview-title" defaultValue="Marketing Intern" className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="preview-job-type" required>Job type</Label>
              <div className="mt-1.5">
                <NativeSelect id="preview-job-type" defaultValue="internship">
                  {JOB_TYPE_OPTIONS.map((option) => (
                    <NativeSelectOption key={option.value} value={option.value}>
                      {option.label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="preview-tags">Job function</Label>
              <TagCombobox id="preview-tags" value={formTags} onChange={setFormTags} className="mt-1.5" />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="preview-summary">Short summary</Label>
              <Textarea
                id="preview-summary"
                defaultValue="Support brand campaigns and social content for a growing retail team."
                className="mt-1.5"
              />
            </div>
          </div>
        </Panel>

        {/* Metric cards — rendered as shipped, complete with its own surface,
            not re-wrapped in Block: how it sits next to Block's card chrome
            is itself part of what this page is for judging. */}
        <div className="xl:col-span-2">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Metric cards · components/admin/analytics/metric-cards.tsx, unmodified
          </p>
          <MetricCards tiles={previewMetricTiles} periodLabel="last 30 days" />
        </div>

        {/* Admin table snippet */}
        <Panel title="Table" description="GridRow + StatusDot" className="xl:col-span-2" >
          <div className="overflow-hidden rounded-b-lg border-t border-border">
            <GridRow columnsClassName="grid-cols-[minmax(0,1fr)_92px]" header>
              <div className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Submission
              </div>
              <div className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Status
              </div>
            </GridRow>
            {previewSubmissions.map((submission) => (
              <GridRow key={submission.id} columnsClassName="grid-cols-[minmax(0,1fr)_92px]">
                <div className="min-w-0 px-4 py-3">
                  <p className="truncate text-sm font-medium text-slate-800">{submission.title}</p>
                  <p className="truncate text-xs text-slate-500">{submission.company}</p>
                </div>
                <div className="flex items-center gap-1.5 px-4 py-3">
                  <StatusDot role={SUBMISSION_STATUS_ROLE[submission.status]} label={submission.status} />
                </div>
              </GridRow>
            ))}
          </div>
        </Panel>

        {/* Chart — same ChartContainer/--chart-* wiring as the analytics dashboard */}
        <Panel title="Chart" description="Interest by job type" className="xl:col-span-2">
          <ChartContainer config={chartConfig} className="w-full" style={{ height: 200 }}>
            <BarChart accessibilityLayer data={previewJobTypeChart} margin={{ top: 12 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="job_type"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                fontSize={11}
              />
              <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
              <Bar dataKey="events" fill="var(--color-events)" radius={6} isAnimationActive={false} />
            </BarChart>
          </ChartContainer>
        </Panel>

        {/* Pagination — the admin tables' version. Page 6 of 12 so both
            ellipses render; local dev rarely has enough rows to page. */}
        <Panel
          title="Pagination"
          description="components/admin/table/admin-pagination.tsx, as used by Jobs / Submissions"
          className="xl:col-span-2"
        >
          <AdminPagination currentPage={6} totalPages={12} baseUrl="#" />
        </Panel>
      </div>
    </div>
  )
}
