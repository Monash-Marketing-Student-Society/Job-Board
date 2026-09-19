import type { LucideIcon } from 'lucide-react'

import { PeriodPicker } from './period-picker'
import type { Period } from '@/lib/analytics/period'

/**
 * One dashboard within the page.
 *
 * The analytics page asks two different questions — how many people the board
 * reached, and what those people did — and it used to answer them in one
 * undifferentiated stack of cards, so a reader scrolling through it had no way
 * to tell where one subject ended and the next began. Splitting the stack into
 * two titled surfaces is the whole of that fix: each section is a sentence's
 * worth of subject, stated once at the top, and everything inside it belongs
 * to that subject.
 *
 * Structurally it is a card holding a tinted well. The well is what makes the
 * white tiles inside read as contents rather than as more page — three
 * surfaces (page grey, section white, well tint) where the tiles sit on top,
 * each step a few percent of lightness rather than a new colour.
 *
 * The period control sits in the header of each section. Both are mirrors of
 * one page-level window — they read from the address and write to it — so
 * unlike the two controls this page once had, they cannot disagree: changing
 * either re-cuts every figure in both sections.
 */
export function DashboardSection({
  title,
  description,
  icon: Icon,
  period,
  basePath,
  children,
}: {
  title: string
  /** Optional: the first dashboard states its subject in one word and needs no gloss. */
  description?: string
  icon: LucideIcon
  period: Period
  /** Where the picker's links point — the admin page, or the local preview. */
  basePath: string
  children: React.ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <Icon className="h-[18px] w-[18px] shrink-0 text-slate-400" aria-hidden />
          <div>
            <h2 className="font-heading text-[15px] font-semibold leading-none text-slate-800">
              {title}
            </h2>
            {description && (
              <p className="mt-1.5 text-[13px] leading-none text-slate-500">{description}</p>
            )}
          </div>
        </div>

        <PeriodPicker period={period} basePath={basePath} />
      </header>

      <div className="space-y-4 border-t border-slate-200 bg-slate-50 p-4">{children}</div>
    </section>
  )
}
