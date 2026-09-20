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
    color: 'var(--chart-3)',
  },
} satisfies ChartConfig

/**
 * Card chrome shared by every block below, so what varies from block to
 * block is only ever the real UI inside it — never the surface it sits on.
 */
function Block({
  title,
  description,
  className,
  bodyClassName,
  children,
}: {
  title: string
  description?: string
  className?: string
  bodyClassName?: string
  children: React.ReactNode
}) {
  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className={cn('flex-1 pt-0', bodyClassName)}>{children}</CardContent>
    </Card>
  )
}

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
        'flex h-16 min-w-[100px] flex-1 flex-col justify-end rounded-lg border border-border p-2',
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
      <header className="space-y-2 border-b border-border pb-6">
        <h1 className="text-3xl font-semibold text-foreground">Theme preview</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Real UI blocks — a job card, a form, an admin table row, a chart — composed on one dense
          canvas instead of shown one at a time. <a href="/admin/style" className="underline underline-offset-2 hover:text-foreground">Reference</a> proves what a
          single token resolves to; this is for judging how a set of them reads once actual
          components sit next to each other. Nothing here writes to Supabase — every block below
          renders from fixture data in <code className="rounded bg-muted px-1 py-0.5 text-xs">mock-data.ts</code>.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {/* Border treatments — full width and first, because it is an open
            question the user is choosing between, not settled documentation
            like everything below it. */}
        <Block
          title="Border treatments — pick one"
          description="The same admin screen rendered in each treatment. Compare columns, not edges: whether the corners agree down a column, and whether the warning looks like it belongs to the card it sits in."
          className="xl:col-span-4"
        >
          <BorderComparison />
        </Block>

        {/* Palette — full width, first, everything else is built from these. */}
        <Block title="Palette" className="xl:col-span-4">
          <div className="flex flex-wrap gap-2">
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
            {[1, 2, 3, 4, 5].map((n) => (
              <Swatch
                key={n}
                label={`chart-${n}`}
                textClassName="text-white"
                style={{ backgroundColor: `var(--chart-${n})` }}
              />
            ))}
          </div>
        </Block>

        {/* Typography */}
        <Block title="Typography" className="xl:col-span-2">
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
        </Block>

        {/* Real job cards, side by side, one selected */}
        <Block title="Job card" description="components/jobs/job-card.tsx, unmodified" className="xl:col-span-2">
          <div className="space-y-2">
            {previewJobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                isSelected={job.id === selectedJobId}
                onClick={() => setSelectedJobId(job.id)}
              />
            ))}
          </div>
        </Block>

        {/* Buttons & badges */}
        <Block title="Buttons & badges">
          <div className="space-y-4">
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
        </Block>

        {/* Alerts */}
        <Block title="Alerts">
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
        </Block>

        {/* Form panel — same primitives as the submit/admin job forms */}
        <Block title="Form" description="Input, NativeSelect, TagCombobox, Textarea" className="xl:col-span-2">
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
        </Block>

        {/* Metric cards — rendered as shipped, complete with its own surface,
            not re-wrapped in Block: how it sits next to Block's card chrome
            is itself part of what this page is for judging. */}
        <div className="xl:col-span-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Metric cards · components/admin/analytics/metric-cards.tsx, unmodified
          </p>
          <MetricCards tiles={previewMetricTiles} periodLabel="last 30 days" />
        </div>

        {/* Admin table snippet */}
        <Block title="Table" description="GridRow + StatusDot, as used in Jobs / Submissions" className="xl:col-span-2" bodyClassName="p-0">
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
        </Block>

        {/* Chart — same ChartContainer/--chart-* wiring as the analytics dashboard */}
        <Block title="Chart" description="Interest by job type, --chart-3" className="xl:col-span-2">
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
        </Block>

        {/* Pagination — the admin tables' version. Page 6 of 12 so both
            ellipses render; local dev rarely has enough rows to page. */}
        <Block
          title="Pagination"
          description="components/admin/table/admin-pagination.tsx, as used by Jobs / Submissions"
          className="xl:col-span-4"
          bodyClassName="flex justify-center"
        >
          <AdminPagination currentPage={6} totalPages={12} baseUrl="#" />
        </Block>
      </div>
    </div>
  )
}
