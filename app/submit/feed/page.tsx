import Link from 'next/link'
import { FeedRequestForm } from '@/components/jobs/feed-request-form'

export const metadata = {
  title: 'List Your Roles | MMSS Job Board',
  description: 'Have your company’s roles listed on the MMSS Job Board automatically.',
}

export default function FeedRequestPage() {
  return (
    <div className="min-h-screen bg-slate-100">
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">List your roles with MMSS</h1>
          <p className="text-slate-500 mt-2 text-sm leading-relaxed">
            Hiring regularly? Instead of posting each role, tell us where your jobs are listed. New roles reach Monash
            marketing students automatically after a quick review, each linking straight to your own application page.
            Posting a single role?{' '}
            <Link href="/submit" className="underline font-medium text-slate-700">
              Use the job form instead
            </Link>
            .
          </p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-6 sm:p-8">
          <FeedRequestForm />
        </div>
      </div>
    </div>
  )
}
