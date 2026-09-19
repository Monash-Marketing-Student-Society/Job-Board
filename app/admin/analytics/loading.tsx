/**
 * The page's own shape, greyed out.
 *
 * It mirrors the two-section structure rather than showing a generic block of
 * pulsing rectangles: the section headers, the four separate tiles per section
 * and the panels beneath them all hold their real footprint, so the layout does
 * not jump when the data lands.
 */
export default function Loading() {
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="h-7 w-40 animate-pulse rounded-lg bg-slate-200" />
          <div className="h-4 w-72 animate-pulse rounded bg-slate-100" />
        </div>
        <div className="h-9 w-72 animate-pulse rounded-xl bg-slate-100" />
      </div>

      <div className="space-y-4">
        <SectionSkeleton panelHeights={[320]} />
        <SectionSkeleton panelHeights={[220, 260]} />
      </div>
    </div>
  )
}

function SectionSkeleton({ panelHeights }: { panelHeights: number[] }) {
  return (
    <section className="overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-sm">
      <header className="flex items-start justify-between gap-3 px-5 py-4">
        <div className="space-y-2">
          <div className="h-4 w-28 animate-pulse rounded bg-slate-200" />
          <div className="h-3 w-56 animate-pulse rounded bg-slate-100" />
        </div>
        <div className="h-7 w-28 animate-pulse rounded-lg bg-slate-100" />
      </header>

      <div className="space-y-3 border-t border-slate-200 bg-slate-50 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="min-h-[132px] space-y-3 rounded-xl border border-slate-200 bg-white px-4 pb-3 pt-3.5"
            >
              <div className="h-3 w-24 animate-pulse rounded bg-slate-100" />
              <div className="h-7 w-20 animate-pulse rounded bg-slate-200" />
              <div className="h-11 animate-pulse rounded bg-slate-50" />
            </div>
          ))}
        </div>

        {panelHeights.map((height, index) => (
          <div
            key={index}
            className="rounded-xl border border-slate-200 bg-white p-4"
            style={{ height }}
          >
            <div className="h-4 w-44 animate-pulse rounded bg-slate-200" />
            <div className="mt-2 h-3 w-56 animate-pulse rounded bg-slate-100" />
            <div className="mt-4 h-[60%] animate-pulse rounded-lg bg-slate-50" />
          </div>
        ))}
      </div>
    </section>
  )
}
