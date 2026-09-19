import type { ReactNode } from 'react'

/**
 * Shared shell for the two legal pages.
 *
 * They are the only long-form prose on the site, and the one thing that makes
 * that kind of page readable is a measure narrow enough to track between lines
 * — hence the max-w-[720px] rather than the 1200px the listing pages use.
 *
 * Typography lives here rather than in a prose plugin so the two documents
 * cannot drift apart: a heading added to one page picks up the same treatment
 * as the other by construction.
 */
export function LegalPage({
  title,
  updated,
  intro,
  children,
}: {
  title: string
  /** ISO date; rendered in Australian format. Bump it whenever the text changes. */
  updated: string
  intro: ReactNode
  children: ReactNode
}) {
  return (
    <div className="max-w-[720px] mx-auto px-4 sm:px-6 py-12 sm:py-16">
      <header className="mb-10">
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">{title}</h1>
        <p className="text-xs uppercase tracking-widest text-slate-400 mt-3">
          Last updated{' '}
          {new Date(updated).toLocaleDateString('en-AU', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </p>
        <div className="mt-6 text-[15px] leading-relaxed text-slate-600">{intro}</div>
      </header>

      <div className="space-y-10">{children}</div>
    </div>
  )
}

export function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-slate-900 mb-3">{heading}</h2>
      <div className="space-y-3 text-[15px] leading-relaxed text-slate-600">{children}</div>
    </section>
  )
}

/**
 * Compact bullet list with an optional bold lead-in.
 *
 * Replaces an earlier term-and-paragraph layout that indented every entry
 * behind a rule: at this measure the detail wrapped to three or four lines and
 * the bold term floated above it, so a four-item list read as four separate
 * sections rather than one list. A bullet keeps the entry visually single,
 * which is what makes a list scannable.
 */
export function Bullets({
  items,
}: {
  items: { lead?: string; text: ReactNode }[]
}) {
  return (
    <ul className="list-disc pl-5 space-y-2 marker:text-slate-400">
      {items.map((item, i) => (
        <li key={item.lead ?? i} className="text-[15px] leading-relaxed text-slate-600 pl-1">
          {item.lead && <strong className="font-semibold text-slate-800">{item.lead}:</strong>}{' '}
          {item.text}
        </li>
      ))}
    </ul>
  )
}
