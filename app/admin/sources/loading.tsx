import { tableCardClassName } from '@/components/admin/table/table-styles'

export default function Loading() {
  return (
    <div>
      <div className="mb-6 space-y-2">
        <div className="h-7 w-28 bg-slate-200 rounded-lg animate-pulse" />
        <div className="h-4 w-96 max-w-full bg-slate-100 rounded animate-pulse" />
      </div>
      <div className={tableCardClassName}>
        <div className="h-10 rounded-xl bg-slate-100/70 animate-pulse" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="px-3 py-4 flex gap-6 items-start">
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 w-28 bg-slate-200 rounded animate-pulse" />
              <div className="h-3 w-20 bg-slate-100 rounded animate-pulse" />
            </div>
            <div className="flex-[1.3] space-y-1.5">
              <div className="h-3.5 w-32 bg-slate-100 rounded animate-pulse" />
              <div className="h-3 w-48 bg-slate-100 rounded animate-pulse" />
            </div>
            <div className="h-8 w-20 bg-slate-100 rounded-lg animate-pulse" />
            <div className="h-5 w-40 bg-slate-100 rounded-full animate-pulse" />
            <div className="h-8 w-20 bg-slate-100 rounded-lg animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  )
}
