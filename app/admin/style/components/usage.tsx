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

  if (!entry || entry.routes.length === 0) {
    return (
      <p className="text-[10px] text-muted-foreground">
        <code>{file}</code> — no live route reaches this.
      </p>
    )
  }

  const publicRoutes = entry.routes.filter(isPublic)
  const adminRoutes = entry.routes.filter((r) => !isPublic(r))

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-1">
        {publicRoutes.map((route) =>
          isLinkable(route) ? (
            <a
              key={route}
              href={`${PROD_ORIGIN}${route === '/' ? '' : route}`}
              target="_blank"
              rel="noreferrer"
              className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary underline underline-offset-2"
            >
              {route} ↗
            </a>
          ) : (
            <span
              key={route}
              className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary"
            >
              {route}
            </span>
          )
        )}
        {adminRoutes.map((route) => (
          <span
            key={route}
            className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
          >
            {route}
          </span>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground/70">
        <code>{file}</code>
        {publicRoutes.length > 0 && ' · purple routes are public'}
      </p>
    </div>
  )
}
