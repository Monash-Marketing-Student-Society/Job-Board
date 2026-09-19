import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { createServerClient } from '@/lib/supabase/server'
import { Button, Badge } from '@/components/ui'
import { ApplyLink } from '@/components/jobs/apply-link'
import { ApplyConfirmPrompt } from '@/components/jobs/apply-confirm-prompt'
import { formatDate, daysUntilClosing, isJobExpired } from '@/lib/utils'
import type { Job } from '@/lib/types'

interface JobDetailPageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: JobDetailPageProps): Promise<Metadata> {
  const { id } = await params
  const supabase = await createServerClient()

  const { data: job } = await supabase
    .from('jobs')
    .select('title, company, description')
    .eq('id', id)
    .eq('is_active', true)
    .single() as { data: Pick<Job, 'title' | 'company' | 'description'> | null }

  if (!job) {
    return {
      title: 'Job Not Found | MMSS Job Board',
    }
  }

  return {
    title: `${job.title} at ${job.company} | MMSS Job Board`,
    description: job.description?.substring(0, 160) || `${job.title} position at ${job.company}`,
  }
}

export default async function JobDetailPage({ params }: JobDetailPageProps) {
  const { id } = await params
  const supabase = await createServerClient()

  const { data: job, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', id)
    .eq('is_active', true)
    .single() as { data: Job | null; error: Error | null }

  if (error || !job) {
    notFound()
  }

  const daysLeft = daysUntilClosing(job.closing_at)
  const expired = isJobExpired(job.closing_at)

  return (
    <main className="flex-1">
      {/* Header */}
      <header className="bg-primary py-8 px-4">
        <div className="container-page">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-primary-foreground/80 text-sm mb-4">
            <Link href="/" className="hover:text-primary-foreground">
              Home
            </Link>
            <span>/</span>
            <Link href="/jobs" className="hover:text-primary-foreground">
              Jobs
            </Link>
            <span>/</span>
            <span className="truncate max-w-[200px]">{job.title}</span>
          </div>

          {/* Job Title & Company */}
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                {expired && (
                  <Badge variant="destructive">Closed</Badge>
                )}
                {/* This header sits on the primary colour, where the default
                    badge (bg-primary) would disappear into it, so the
                    disclosure is inverted to read against the background. */}
                {job.is_sponsored && (
                  <span className="inline-flex items-center text-xs px-2.5 py-0.5 rounded-full bg-white text-primary font-semibold">
                    Sponsored
                  </span>
                )}
              </div>
              <h1 className="text-3xl font-bold text-primary-foreground">
                {job.title}
              </h1>
              <p className="text-xl text-primary-foreground/90 mt-1">
                {job.company}
              </p>
            </div>

            {!expired && (
              <ApplyLink
                jobId={job.id}
                jobTitle={job.title}
                jobCompany={job.company}
                href={job.url}
                className="btn-md bg-white text-primary hover:bg-white/90 font-semibold rounded-md inline-flex items-center"
              >
                Apply Now
                <ExternalLinkIcon className="h-4 w-4 ml-2" />
              </ApplyLink>
            )}
          </div>
        </div>
      </header>

      <div className="container-page py-8">
        <div className="grid gap-8 lg:grid-cols-3">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">
            {/* Description */}
            {job.description && (
              <section>
                <h2 className="text-xl font-semibold mb-4">About This Role</h2>
                <div className="prose prose-sm max-w-none text-foreground">
                  <div className="whitespace-pre-wrap">{job.description}</div>
                </div>
              </section>
            )}

            {/* Tags */}
            {job.tags && job.tags.length > 0 && (
              <section>
                <h2 className="text-xl font-semibold mb-4">Skills & Tags</h2>
                <div className="flex flex-wrap gap-2">
                  {job.tags.map((tag) => (
                    <Badge key={tag} variant="outline">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* Sidebar */}
          <aside className="lg:col-span-1">
            <div className="sticky top-4 space-y-6">
              {/* Job Details Card */}
              <div className="rounded-lg border border-border p-6 space-y-4">
                <h2 className="font-semibold">Job Details</h2>

                <div className="space-y-3">
                  {job.location && (
                    <DetailRow
                      icon={<LocationIcon className="h-5 w-5" />}
                      label="Location"
                      value={job.location}
                    />
                  )}

                  {job.work_mode && (
                    <DetailRow
                      icon={<BuildingIcon className="h-5 w-5" />}
                      label="Work Mode"
                      value={capitalizeFirst(job.work_mode)}
                    />
                  )}

                  {job.job_type && (
                    <DetailRow
                      icon={<BriefcaseIcon className="h-5 w-5" />}
                      label="Job Type"
                      value={capitalizeFirst(job.job_type.replace('-', ' '))}
                    />
                  )}

                  {job.posted_at && (
                    <DetailRow
                      icon={<CalendarIcon className="h-5 w-5" />}
                      label="Posted"
                      value={formatDate(job.posted_at)}
                    />
                  )}

                  {job.closing_at && (
                    <DetailRow
                      icon={<ClockIcon className="h-5 w-5" />}
                      label="Closing Date"
                      value={formatDate(job.closing_at)}
                      highlight={daysLeft !== null && daysLeft <= 7 && daysLeft > 0}
                    />
                  )}
                </div>

                {daysLeft !== null && daysLeft > 0 && daysLeft <= 7 && (
                  <p className="text-sm text-accent font-medium">
                    Closes in {daysLeft} day{daysLeft !== 1 ? 's' : ''}!
                  </p>
                )}
              </div>

              {/* Apply Button (Mobile) */}
              {!expired && (
                <ApplyLink
                  jobId={job.id}
                  jobTitle={job.title}
                  jobCompany={job.company}
                  href={job.url}
                  className="w-full btn-primary btn-lg flex items-center justify-center lg:hidden"
                >
                  Apply Now
                  <ExternalLinkIcon className="h-4 w-4 ml-2" />
                </ApplyLink>
              )}

              {/* Back to Jobs */}
              <Link href="/jobs">
                <Button variant="outline" className="w-full">
                  <ArrowLeftIcon className="h-4 w-4 mr-2" />
                  Back to Jobs
                </Button>
              </Link>
            </div>
          </aside>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t py-8 px-4 mt-auto">
        <div className="container-page text-center text-sm text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} Monash Marketing Students&apos; Society. All rights reserved.</p>
        </div>
      </footer>

      <ApplyConfirmPrompt />
    </main>
  )
}

function DetailRow({
  icon,
  label,
  value,
  highlight,
}: {
  icon: React.ReactNode
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-muted-foreground shrink-0">{icon}</span>
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className={`font-medium ${highlight ? 'text-accent' : ''}`}>{value}</p>
      </div>
    </div>
  )
}

function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

// Icons
function LocationIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="m9.69 18.933.003.001C9.89 19.02 10 19 10 19s.11.02.308-.066l.002-.001.006-.003.018-.008a5.741 5.741 0 0 0 .281-.14c.186-.096.446-.24.757-.433.62-.384 1.445-.966 2.274-1.765C15.302 14.988 17 12.493 17 9A7 7 0 1 0 3 9c0 3.492 1.698 5.988 3.355 7.584a13.731 13.731 0 0 0 2.273 1.765 11.842 11.842 0 0 0 .976.544l.062.029.018.008.006.003ZM10 11.25a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5Z" clipRule="evenodd" />
    </svg>
  )
}

function BuildingIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M4 16.5v-13h-.25a.75.75 0 0 1 0-1.5h12.5a.75.75 0 0 1 0 1.5H16v13h.25a.75.75 0 0 1 0 1.5h-3.5a.75.75 0 0 1-.75-.75v-2.5a.75.75 0 0 0-.75-.75h-2.5a.75.75 0 0 0-.75.75v2.5a.75.75 0 0 1-.75.75h-3.5a.75.75 0 0 1 0-1.5H4Zm3-11a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5v-1ZM7.5 9a.5.5 0 0 0-.5.5v1a.5.5 0 0 0 .5.5h1a.5.5 0 0 0 .5-.5v-1a.5.5 0 0 0-.5-.5h-1ZM11 5.5a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5v-1Zm.5 3.5a.5.5 0 0 0-.5.5v1a.5.5 0 0 0 .5.5h1a.5.5 0 0 0 .5-.5v-1a.5.5 0 0 0-.5-.5h-1Z" clipRule="evenodd" />
    </svg>
  )
}

function BriefcaseIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M6 3.75A2.75 2.75 0 0 1 8.75 1h2.5A2.75 2.75 0 0 1 14 3.75v.443c.572.055 1.14.122 1.706.2C17.053 4.582 18 5.75 18 7.07v3.469c0 1.126-.694 2.191-1.83 2.54-1.952.599-4.024.921-6.17.921s-4.219-.322-6.17-.921C2.694 12.73 2 11.665 2 10.539V7.07c0-1.321.947-2.489 2.294-2.676A41.047 41.047 0 0 1 6 4.193V3.75Zm6.5 0v.325a41.622 41.622 0 0 0-5 0V3.75c0-.69.56-1.25 1.25-1.25h2.5c.69 0 1.25.56 1.25 1.25ZM10 10a1 1 0 0 0-1 1v.01a1 1 0 0 0 1 1h.01a1 1 0 0 0 1-1V11a1 1 0 0 0-1-1H10Z" clipRule="evenodd" />
      <path d="M3 15.055v-.684c.126.053.255.1.39.142 2.092.642 4.313.987 6.61.987 2.297 0 4.518-.345 6.61-.987.135-.041.264-.089.39-.142v.684c0 1.347-.985 2.53-2.363 2.686a41.454 41.454 0 0 1-9.274 0C3.985 17.585 3 16.402 3 15.055Z" />
    </svg>
  )
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M5.75 2a.75.75 0 0 1 .75.75V4h7V2.75a.75.75 0 0 1 1.5 0V4h.25A2.75 2.75 0 0 1 18 6.75v8.5A2.75 2.75 0 0 1 15.25 18H4.75A2.75 2.75 0 0 1 2 15.25v-8.5A2.75 2.75 0 0 1 4.75 4H5V2.75A.75.75 0 0 1 5.75 2Zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75Z" clipRule="evenodd" />
    </svg>
  )
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-13a.75.75 0 0 0-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 0 0 0-1.5h-3.25V5Z" clipRule="evenodd" />
    </svg>
  )
}

function ExternalLinkIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M4.25 5.5a.75.75 0 0 0-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 0 0 .75-.75v-4a.75.75 0 0 1 1.5 0v4A2.25 2.25 0 0 1 12.75 17h-8.5A2.25 2.25 0 0 1 2 14.75v-8.5A2.25 2.25 0 0 1 4.25 4h5a.75.75 0 0 1 0 1.5h-5Z" clipRule="evenodd" />
      <path fillRule="evenodd" d="M6.194 12.753a.75.75 0 0 0 1.06.053L16.5 4.44v2.81a.75.75 0 0 0 1.5 0v-4.5a.75.75 0 0 0-.75-.75h-4.5a.75.75 0 0 0 0 1.5h2.553l-9.056 8.194a.75.75 0 0 0-.053 1.06Z" clipRule="evenodd" />
    </svg>
  )
}

function ArrowLeftIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z" clipRule="evenodd" />
    </svg>
  )
}
