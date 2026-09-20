'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { TokenControls } from './token-controls'
import { NotesExport } from './note'

/**
 * Layout for both style tabs: a dark control rail beside a roomy canvas.
 *
 * The rail exists to get the controls out of the reading surface. Both
 * pages previously opened with a wall of sliders, warnings and code paths
 * above the first specimen, which buried the thing the page is for. Tools
 * on the left, work on the right — and the rail's dark ground doubles as a
 * neutral reference edge, since every specimen is light.
 *
 * It is sticky on desktop and collapses above the canvas on narrow screens,
 * where a fixed rail would eat the width the specimens need.
 */

const TABS = [
  { href: '/admin/style', label: 'Reference', hint: 'What each token resolves to' },
  { href: '/admin/style/preview', label: 'Preview', hint: 'How they read together' },
]

export function StyleShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
      <aside className="w-full shrink-0 rounded-2xl bg-[#1b1a1f] p-5 text-white lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:w-72 lg:overflow-y-auto">
        <div className="space-y-5">
          <div className="space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-white/40">
              MMSS
            </p>
            <h1 className="text-lg font-semibold leading-tight">Design system</h1>
          </div>

          <nav className="space-y-1">
            {TABS.map((tab) => {
              const active = pathname === tab.href
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={cn(
                    'block rounded-xl px-3 py-2.5 transition-colors',
                    active ? 'bg-white/10' : 'hover:bg-white/5'
                  )}
                >
                  <span
                    className={cn(
                      'block text-sm font-medium',
                      active ? 'text-white' : 'text-white/70'
                    )}
                  >
                    {tab.label}
                  </span>
                  <span className="block text-[11px] text-white/40">{tab.hint}</span>
                </Link>
              )
            })}
          </nav>

          <TokenControls />

          <div className="border-t border-white/10 pt-4">
            <NotesExport />
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 pb-24">{children}</main>
    </div>
  )
}

/**
 * One card, one idea. Title and description are the only chrome; anything
 * that is not the specimen itself belongs in `meta`, which renders as a
 * single quiet line under a hairline rather than as another paragraph.
 */
export function Panel({
  title,
  description,
  meta,
  className,
  children,
}: {
  title: string
  description?: string
  meta?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <section className={cn('rounded-2xl bg-white p-6 shadow-sm', className)}>
      <div className="mb-5 space-y-1">
        <h2 className="text-[15px] font-semibold text-slate-900">{title}</h2>
        {description && <p className="text-[13px] leading-relaxed text-slate-500">{description}</p>}
      </div>

      {children}

      {meta && <div className="mt-5 border-t border-slate-100 pt-3">{meta}</div>}
    </section>
  )
}
