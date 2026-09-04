import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { JobForm } from '@/components/admin'
import type { Job } from '@/lib/types'

interface EditJobPageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: EditJobPageProps) {
  const { id } = await params
  const supabase = await createServerClient()
  const { data: job } = await supabase
    .from('jobs')
    .select('title')
    .eq('id', id)
    .single() as { data: { title: string } | null }
  return {
    title: job ? `Edit: ${job.title} | Admin | MMSS Job Board` : 'Edit Job | Admin',
  }
}

export default async function AdminEditJobPage({ params }: EditJobPageProps) {
  const { id } = await params
  const supabase = await createServerClient()
  const { data: job, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', id)
    .single() as { data: Job | null; error: Error | null }

  if (error || !job) notFound()

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-[22px] font-bold text-slate-800 font-heading">
          Edit Job
        </h1>
        <p className="text-sm text-slate-500 mt-1">Update job listing details</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
        <JobForm job={job} isEditing />
      </div>
    </div>
  )
}
