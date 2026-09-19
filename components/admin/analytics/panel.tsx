/**
 * The white card every block inside a dashboard section sits on.
 *
 * One component rather than the same twelve-class string on the chart, the
 * funnel and both interest lists — they are the same object, and the moment
 * one of them drifts by two pixels of padding the section stops reading as a
 * set. It is deliberately not `components/ui/card`: that one resolves to
 * `bg-background`, which is the page's grey, so every analytics card already
 * overrode both its background and its radius.
 *
 * Radii are concentric with the section around it — 20px section, 16px of
 * well padding, 12px panel — so the corners nest instead of fighting.
 */
export function Panel({
  title,
  description,
  aside,
  children,
  className = '',
  bodyClassName = '',
}: {
  title: string
  /** A second line under the title. Movement, a total, a caveat — not a restatement. */
  description?: React.ReactNode
  /** Top-right slot: a count, a legend, a link. */
  aside?: React.ReactNode
  children: React.ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section
      className={`rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${className}`}
    >
      <header className="flex items-start justify-between gap-3 px-5 pb-3 pt-4">
        <div className="min-w-0">
          <h3 className="font-heading text-[13.5px] font-semibold leading-none text-slate-800">
            {title}
          </h3>
          {description && (
            <div className="mt-1.5 text-xs leading-none text-slate-500">{description}</div>
          )}
        </div>
        {aside && <div className="shrink-0">{aside}</div>}
      </header>

      <div className={`px-5 pb-5 ${bodyClassName}`}>{children}</div>
    </section>
  )
}
