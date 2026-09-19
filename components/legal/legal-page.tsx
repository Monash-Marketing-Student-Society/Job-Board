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
 * Definition-style list for "what we collect" and similar.
 *
 * A table would be the obvious choice and the wrong one: these rows are a term
 * and a paragraph, and a two-column table forces the paragraph into a gutter
 * that collapses badly on a phone.
 */
export function Defs({ items }: { items: { term: string; detail: ReactNode }[] }) {
  return (
    <dl className="space-y-4 mt-1">
      {items.map((item) => (
        <div key={item.term} className="border-l-2 border-slate-200 pl-4">
          <dt className="text-sm font-semibold text-slate-800">{item.term}</dt>
          <dd className="text-[15px] leading-relaxed text-slate-600 mt-1">{item.detail}</dd>
        </div>
      ))}
    </dl>
  )
}
