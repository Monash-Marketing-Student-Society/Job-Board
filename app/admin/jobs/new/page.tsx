import { JobForm } from '@/components/admin'

export const metadata = {
  title: 'Add Job | Admin | MMSS Job Board',
}

export default function AdminNewJobPage() {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-[22px] font-bold text-slate-800 font-heading">
          Add New Job
        </h1>
        <p className="text-sm text-slate-500 mt-1">Create a new job listing</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
        <JobForm />
      </div>
    </div>
  )
}
