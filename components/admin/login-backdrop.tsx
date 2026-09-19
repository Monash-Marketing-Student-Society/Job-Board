/**
 * Decorative, blurred facsimile of the Manage Jobs dashboard, sat behind the
 * sign-in card.
 *
 * The rows are invented, and deliberately generic. /admin/login is public and
 * unauthenticated, so rendering the real dashboard here would put the job
 * table in the page source of the one page that exists to keep people out of
 * it. `filter: blur()` is a paint-time effect, not redaction: the text
 * underneath stays selectable, searchable and readable in devtools. Anything
 * shown here therefore has to be safe to publish, which is why none of it is
 * real. If somebody strips the blur, they should see obvious placeholder
 * content and know immediately that it is scenery.
 *
 * aria-hidden and pointer-events-none: it is a texture, not content. A screen
 * reader should hear the sign-in form and nothing else, and no blurred row
 * should ever swallow a click meant for the card.
 */

const ROWS = [
  { title: 'Marketing Intern', org: 'Retail Group', status: 'Active', date: '2 Sept 2026' },
  { title: 'Graduate Brand Strategist', org: 'Agency Co', status: 'Active', date: '2 Sept 2026' },
  { title: 'Social Media Coordinator', org: 'Consumer Brands', status: 'Active', date: '24 Aug 2026' },
  { title: 'Communications Assistant', org: 'Media Partners', status: 'Inactive', date: '22 May 2026' },
  { title: 'Graduate Analyst Program', org: 'Consulting Group', status: 'Inactive', date: '22 May 2026' },
  { title: 'Content Marketing Writer', org: 'Technology Co', status: 'Inactive', date: '21 May 2026' },
  { title: 'Campaign Operations Intern', org: 'Logistics Co', status: 'Inactive', date: '21 May 2026' },
  { title: 'Digital Marketing Assistant', org: 'Finance Group', status: 'Inactive', date: '18 May 2026' },
]

export function LoginBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 z-0 overflow-hidden pointer-events-none select-none"
    >
      {/* scale-105 hides the transparent fringe blur leaves at the edges: a
          blurred element samples past its own bounds, so without the overscan
          the page background shows through as a soft border. */}
      <div className="absolute inset-0 blur-[7px] scale-105 origin-center">
        <div className="max-w-[1200px] mx-auto px-[15px] pt-[15px]">
          {/* Nav pill */}
          <div className="bg-white rounded-[15px] h-[50px] px-[15px] flex items-center justify-between">
            <div className="h-5 w-28 rounded bg-slate-300/70" />
            <div className="flex items-center gap-6">
              <div className="h-3 w-12 rounded bg-slate-300/60" />
              <div className="h-3 w-20 rounded bg-slate-300/60" />
              <div className="h-3 w-16 rounded bg-slate-300/60" />
              <div className="h-3 w-14 rounded bg-slate-300/60" />
              <div className="h-8 w-24 rounded-lg border border-slate-300/70" />
            </div>
          </div>

          <div className="mt-8 mb-5">
            <div className="h-6 w-40 rounded bg-slate-400/50" />
            <div className="h-3 w-56 rounded bg-slate-300/50 mt-3" />
          </div>

          {/* Table card */}
          <div className="bg-white rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-2">
                <div className="h-9 w-20 rounded-full bg-slate-100" />
                <div className="h-9 w-24 rounded-full" />
                <div className="h-9 w-24 rounded-full" />
              </div>
              <div className="flex items-center gap-3">
                <div className="h-9 w-64 rounded-full bg-slate-100" />
                <div className="h-9 w-32 rounded-full bg-slate-100" />
                <div className="h-9 w-28 rounded-full bg-primary/80" />
              </div>
            </div>

            <div className="bg-slate-50 px-6 py-3 flex items-center justify-between">
              <div className="h-2.5 w-10 rounded bg-slate-300/70" />
              <div className="flex gap-16">
                <div className="h-2.5 w-12 rounded bg-slate-300/70" />
                <div className="h-2.5 w-12 rounded bg-slate-300/70" />
              </div>
            </div>

            {ROWS.map((row) => (
              <div
                key={row.title}
                className="px-6 py-4 flex items-center justify-between border-b border-slate-50"
              >
                <div>
                  <p className="text-[15px] font-semibold text-slate-800">{row.title}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{row.org} &middot; manual</p>
                </div>
                <div className="flex items-center gap-16">
                  <span
                    className={
                      row.status === 'Active'
                        ? 'text-sm text-emerald-600'
                        : 'text-sm text-slate-400'
                    }
                  >
                    &bull; {row.status}
                  </span>
                  <span className="text-sm text-slate-400 w-24 text-right">{row.date}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Scrim. The card carries the only text anyone has to read on this page,
          and a busy backdrop costs it contrast, so the scenery is knocked back
          rather than left competing. */}
      <div className="absolute inset-0 bg-[#e8e8e8]/70" />
    </div>
  )
}
