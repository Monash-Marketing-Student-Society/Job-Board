'use client'

import { useState } from 'react'
import { Panel } from '../components/shell'
import { NOTIFICATION_GROUPS, TOTAL, preview, type NotificationSpec } from './catalogue'

/**
 * Every notification the app can raise, grouped by the job someone is doing
 * when it appears.
 *
 * Pressing Show fires the real toast through the real sonner instance, so it
 * lands bottom right at the size, colour and duration a user gets. A drawing
 * of a toast on this page would be a different component with the same words.
 */

const KIND_LABEL: Record<NotificationSpec['kind'], string> = {
  success: 'Success',
  error: 'Error',
  warning: 'Warning',
}

const KIND_DOT: Record<NotificationSpec['kind'], string> = {
  success: 'bg-success',
  error: 'bg-destructive',
  warning: 'bg-warning',
}

function Row({ spec }: { spec: NotificationSpec }) {
  return (
    <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:gap-5">
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${KIND_DOT[spec.kind]}`} />
          <span className="text-[13px] font-medium text-slate-900">{spec.title}</span>
          {spec.dynamic && (
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
              wording varies
            </span>
          )}
        </div>

        {spec.description && (
          <p className="pl-3.5 text-[12px] text-slate-500">
            Second line: {spec.description}
          </p>
        )}

        <p className="pl-3.5 text-[13px] leading-relaxed text-slate-600">{spec.trigger}</p>

        {spec.note && (
          <p className="pl-3.5 text-[12px] leading-relaxed text-slate-400">{spec.note}</p>
        )}

        <p className="pl-3.5 text-[11px] text-slate-400">
          {spec.route} · <code>{spec.file}</code>
        </p>
      </div>

      <button
        type="button"
        onClick={() => preview(spec)}
        className="shrink-0 self-start rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-medium text-slate-700 hover:bg-slate-50"
      >
        Show
      </button>
    </div>
  )
}

export function NotificationsClient() {
  const [filter, setFilter] = useState<'all' | NotificationSpec['kind'] | 'public'>('all')

  const matches = (spec: NotificationSpec) =>
    filter === 'all' ||
    (filter === 'public' ? spec.audience === 'public' : spec.kind === filter)

  const filters: { value: typeof filter; label: string }[] = [
    { value: 'all', label: `All ${TOTAL}` },
    { value: 'success', label: 'Success' },
    { value: 'error', label: 'Error' },
    { value: 'warning', label: 'Warning' },
    { value: 'public', label: 'Seen by employers' },
  ]

  return (
    <div className="space-y-5">
      <header className="mb-6 space-y-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-slate-900">Notifications</h1>
          <p className="text-[13px] text-slate-500">
            Every toast the site can raise, and what has to happen for it to appear. Press Show to
            fire the real one — it lands bottom right, as a user gets it.
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {filters.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={
                filter === f.value
                  ? 'rounded-lg bg-slate-900 px-3 py-1.5 text-[12px] font-medium text-white'
                  : 'rounded-lg bg-white px-3 py-1.5 text-[12px] font-medium text-slate-600 hover:bg-slate-50'
              }
            >
              {f.label}
            </button>
          ))}
        </div>
      </header>

      {NOTIFICATION_GROUPS.map((group) => {
        const items = group.items.filter(matches)
        if (!items.length) return null

        return (
          <Panel
            key={group.group}
            title={group.group}
            description={group.blurb}
            meta={
              <p className="text-[11px] text-slate-400">
                {items.length} of {group.items.length} shown
              </p>
            }
          >
            <div className="divide-y divide-slate-100">
              {items.map((spec) => (
                <Row key={spec.id} spec={spec} />
              ))}
            </div>
          </Panel>
        )
      })}

      <Panel
        title="How they behave"
        description="Shared by every toast above."
      >
        <ul className="space-y-2 text-[13px] leading-relaxed text-slate-600">
          <li>
            <span className="font-medium text-slate-900">Bottom right</span>, from one{' '}
            <code>Toaster</code> in the root layout — so the public submit form and the admin share
            the same one.
          </li>
          <li>
            <span className="font-medium text-slate-900">Neutral surface</span>, with status carried
            by the icon. <code>richColors</code> is deliberately off: a solid green panel for every
            success leaves an error nothing to be louder than.
          </li>
          <li>
            <span className="font-medium text-slate-900">Dismissable</span>, and stacking — several
            in a row queue rather than replace each other.
          </li>
          <li>
            <span className="font-medium text-slate-900">Ten seconds</span> for the two
            email-failed warnings, which ask the admin to do something. Everything else uses the
            default.
          </li>
        </ul>
      </Panel>

      <Panel
        title="Not toasts"
        description="Three things announce themselves inline instead, on purpose."
      >
        <ul className="space-y-2 text-[13px] leading-relaxed text-slate-600">
          <li>
            The <span className="font-medium text-slate-900">submission success screen</span>{' '}
            replaces the form on <code>/submit</code>. As a toast it would leave a blank page.
          </li>
          <li>
            The <span className="font-medium text-slate-900">bulk import result</span> and its
            per-row errors are a report to read against the spreadsheet, not an event.
          </li>
          <li>
            The <span className="font-medium text-slate-900">expired reset link</span> on{' '}
            <code>/admin/reset-password</code> is the state of the page, not something that just
            happened.
          </li>
        </ul>
      </Panel>
    </div>
  )
}
