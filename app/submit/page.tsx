import Link from 'next/link'
import { JobSubmissionForm } from '@/components/jobs/job-submission-form'

export const metadata = {
  title: 'Post a Job | MMSS Job Board',
  description: 'Submit a job listing for Monash MMSS students.',
}

export default function SubmitJobPage() {
  return (
    <div className="min-h-screen bg-slate-100">
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Post a Job</h1>
          <p className="text-slate-500 mt-2 text-sm leading-relaxed">
            Submit a job listing for Monash MMSS students. Our team will review
            your submission within 2–3 business days before it goes live.
          </p>
          <p className="text-slate-500 mt-2 text-sm">
            Hiring regularly?{' '}
            <Link href="/submit/feed" className="underline font-medium text-slate-700">
              List all your roles automatically
            </Link>
            .
          </p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-6 sm:p-8">
          <JobSubmissionForm />
        </div>
      </div>
    </div>
  )
}
