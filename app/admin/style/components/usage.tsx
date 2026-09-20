'use client'

import { styleAudit } from '../lib/scan'

/**
 * Where a component shows up on the live site.
 *
 * Routes come from the import graph walked in scripts/audit-style-usage.mjs,
 * so the list is generated and cannot drift from the code. It answers
 * "reachable from this route", which is a slightly wider claim than
 * "renders on screen there": a component imported behind a condition still
 * counts. It is also blind to dynamic imports, so it undercounts rather
 * than inventing a route.
 *
 * Public routes link to production. Admin routes do not — they are behind a
 * login, and a link that lands on a sign-in form is not evidence of
 * anything.
 */

const PROD_ORIGIN = 'https://jobs.monashmss.com'

/** Routes reachable without signing in. */
function isPublic(route: string) {
  return !route.startsWith('/admin')
}

/** A dynamic segment cannot be linked without picking a record. */
function isLinkable(route: string) {
  return isPublic(route) && !route.includes('[')
}

export function Usage({ file }: { file: string }) {
  const entry = styleAudit.routeUsage.files.find((f) => f.file === file)
  const routes = entry?.routes ?? []

  // Public routes lead because they are the ones anyone can go and look at,
  // but admin routes are still named. Showing only public routes and
  // counting the rest meant an admin-only component — every table icon, the
  // whole tooltip layer — rendered as a bare "+10 more", which answers
  // nothing.
  const ordered = [...routes.filter(isPublic), ...routes.filter((r) => !isPublic(r))]
  const shown = ordered.slice(0, 3)
  const rest = ordered.length - shown.length

  return (
    <p className="text-[11px] leading-relaxed text-slate-400">
      <code className="text-slate-400">{file}</code>
      {routes.length === 0 ? (
        ' · no live route'
      ) : (
        <>
          {' · '}
          {shown.map((route, i) => (
            <span key={route}>
              {i > 0 && ', '}
              {isLinkable(route) ? (
                <a
                  href={`${PROD_ORIGIN}${route === '/' ? '' : route}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-slate-500 underline underline-offset-2 hover:text-slate-800"
                >
                  {route}
                </a>
              ) : (
                <span className="text-slate-500">{route}</span>
              )}
            </span>
          ))}
          {rest > 0 && ` +${rest} more`}
        </>
      )}
    </p>
  )
}
