'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { CalendarDays, Check, ChevronDown } from 'lucide-react'

import { Popover, PopoverContent, PopoverTrigger } from '@/components/shadcn/popover'
import { Button, Input, Label } from '@/components/ui'
import { RANGES } from '@/lib/analytics/constants'
import { MAX_CUSTOM_DAYS, daysBetween, todayInReportingZone } from '@/lib/analytics/period'
import type { Period } from '@/lib/analytics/period'

/**
 * The page's period control.
 *
 * It replaces the tab strip the page used to carry, and it is deliberately the
 * same object that used to be a label: the chip in each section header already
 * said which window you were looking at, so making that the thing you press
 * puts the control where the question is asked.
 *
 * Both sections render one. They are mirrors of a single page-level period —
 * changing either changes the address, and the whole page is re-cut from it —
 * so the pair can never disagree the way the old dual controls could.
 *
 * Navigation, not local state: the period decides what the server aggregates,
 * every figure on the page is cut from it, and the snapshot for each window is
 * cached for five minutes. Keeping it in the URL is what makes a particular
 * view linkable and the back button step through periods.
 */
export function PeriodPicker({ period }: { period: Period }) {
  const router = useRouter()
  // The control rewrites the query of the page it is rendered on rather than
  // naming that page, so it stays correct wherever the dashboards are mounted.
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [showCustom, setShowCustom] = useState(period.custom)
  const [from, setFrom] = useState(period.from)
  const [to, setTo] = useState(period.to)

  const today = todayInReportingZone()
  const problem = validate(from, to, today)

  function go(href: string) {
    setOpen(false)
    router.push(href, { scroll: false })
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        // Reopening should show the period that is actually on screen, not
        // whatever half-finished dates were abandoned last time.
        if (next) {
          setShowCustom(period.custom)
          setFrom(period.from)
          setTo(period.to)
        }
      }}
    >
      <PopoverTrigger
        className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 data-open:bg-slate-200"
        aria-label={`Reporting period: ${period.label}. Change`}
      >
        <CalendarDays className="h-3.5 w-3.5 text-slate-400" aria-hidden />
        {period.label}
        <ChevronDown className="h-3 w-3 text-slate-400" aria-hidden />
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[280px] p-1.5">
        <div role="group" aria-label="Preset periods">
          {RANGES.map((range) => {
            const active = !period.custom && period.key === range.value

            return (
              <button
                key={range.value}
                type="button"
                onClick={() => go(`${pathname}?range=${range.value}`)}
                className={`flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-[13px] transition-colors hover:bg-slate-100 ${
                  active ? 'font-semibold text-slate-900' : 'font-medium text-slate-600'
                }`}
              >
                {range.label}
                {active && <Check className="h-3.5 w-3.5 text-slate-400" aria-hidden />}
              </button>
            )
          })}
        </div>

        <div className="my-1.5 border-t border-slate-100" />

        {!showCustom ? (
          <button
            type="button"
            onClick={() => setShowCustom(true)}
            className={`flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-[13px] transition-colors hover:bg-slate-100 ${
              period.custom ? 'font-semibold text-slate-900' : 'font-medium text-slate-600'
            }`}
          >
            Custom range…
            {period.custom && <Check className="h-3.5 w-3.5 text-slate-400" aria-hidden />}
          </button>
        ) : (
          <form
            className="px-2.5 pb-1.5 pt-1"
            onSubmit={(event) => {
              event.preventDefault()
              if (!problem) go(`${pathname}?from=${from}&to=${to}`)
            }}
          >
            {/* The project's own Input and Button, not a second set of
                hand-rolled ones: this panel sits on the same pages as the job
                and submission forms, and a control that is two pixels and one
                radius away from those reads as a different product. */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="period-from" className="text-xs">
                  From
                </Label>
                <Input
                  id="period-from"
                  type="date"
                  value={from}
                  max={to || today}
                  onChange={(event) => setFrom(event.target.value)}
                  className="mt-1.5 h-9 px-2.5 text-[13px]"
                />
              </div>
              <div>
                <Label htmlFor="period-to" className="text-xs">
                  To
                </Label>
                <Input
                  id="period-to"
                  type="date"
                  value={to}
                  min={from}
                  max={today}
                  onChange={(event) => setTo(event.target.value)}
                  className="mt-1.5 h-9 px-2.5 text-[13px]"
                />
              </div>
            </div>

            {/* Only ever the problem. The running day count that used to sit
                here said nothing the two dates above it did not already say,
                and it said it on every keystroke. */}
            {problem && (
              <p className="mt-2 text-[11px] leading-snug text-destructive">{problem}</p>
            )}

            <Button
              type="submit"
              size="sm"
              disabled={Boolean(problem)}
              className="mt-3 w-full"
            >
              Apply
            </Button>
          </form>
        )}
      </PopoverContent>
    </Popover>
  )
}

/** The same rules `resolvePeriod` enforces, said in the first person. */
function validate(from: string, to: string, today: string): string | null {
  if (!from || !to) return 'Pick both dates.'
  if (from > to) return 'The first date has to come before the second.'
  if (to > today) return 'There is no data from the future.'

  const span = daysBetween(from, to) + 1
  if (span > MAX_CUSTOM_DAYS) {
    return `Custom ranges go up to ${MAX_CUSTOM_DAYS} days — this one is ${span}. For longer, use Last 3 months.`
  }

  return null
}
