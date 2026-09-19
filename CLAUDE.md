# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # localhost:3000 (starts local Supabase first if it is down)
npm run build
npm run lint
npm test
npm run db:start # supabase start — needs Docker running
npm run db:stop
npm run seed:analytics   # fabricate ~190 days of analytics events (local DB only)
```

## Local Supabase

`.env.local` points at the **local** stack (`http://127.0.0.1:54321`), and the keys
in it are local keys — the hosted project rejects them. So the app has no database
until `supabase start` is up, and Docker does not survive a reboot.

When it is down, every request fails with `ECONNREFUSED 127.0.0.1:54321` and the
board renders "No jobs found", which looks exactly like an empty database rather
than a missing one. `scripts/dev-preflight.mjs` runs as `predev` to catch this: it
probes the URL, starts the stack if Docker is up, and otherwise prints the fix.
It never fails the build — a broken Docker must not make `npm run dev` unrunnable.

## Next.js Version Warning

This project uses **Next.js 15** (App Router), which has breaking changes relative to older versions. APIs, conventions, and file structure may differ from training data. Check `node_modules/next/dist/docs/` before writing code; heed deprecation notices.

## Architecture Overview

MMSS Job Board — public job listings for Monash Marketing Students' Society, with HR self-serve submissions and an admin dashboard.

**Key directories:**
- `app/` — App Router routes (public, admin, API)
- `components/` — React components (`ui/`, `admin/`, `jobs/`)
- `lib/` — Supabase clients, types, utilities, email templates
- `supabase/migrations/` — 4 SQL migrations (full schema lives here)

## Supabase: Three Clients

This is the most important architectural detail. There are three distinct Supabase clients:

| Client | File | Key | Use |
|---|---|---|---|
| Browser | `lib/supabase/client.ts` | anon (RLS enforced) | Client components |
| Server | `lib/supabase/server.ts` | anon (RLS enforced) | Server components, route handlers |
| Admin | `lib/supabase/admin.ts` | service role (**bypasses RLS**) | Server-only: submissions approval, email sends |

Middleware (`middleware.ts` → `lib/supabase/middleware.ts`) refreshes auth tokens on every request and protects `/admin/*` routes by checking `admin_users.is_admin`.

## Routes

**Public:** `/` and `/jobs` (identical — known duplication, refactor candidate), `/jobs/[id]`, `/submit`, `/submit/edit?token=<edit-token>`

**Admin (requires `is_admin`):** `/admin/login`, `/admin/jobs`, `/admin/submissions`, `/admin/users`

**API routes:** `GET /api/prefill-job?url=` · `POST /api/submit-job` · `PATCH /api/submit-job/[token]` · `POST /api/admin/submissions/[id]/approve` · `POST /api/admin/submissions/[id]/reject` · `GET|POST /api/admin/users` · `DELETE /api/admin/users/[id]` · `POST /api/auth/signout`

## HR Submission Flow

1. Employer visits `/submit` → fills form → blur on URL field triggers AI prefill
2. `POST /api/submit-job` — inserts via service role, sends Resend emails non-blocking
3. Returns `edit_token`; submitter can re-edit via `/submit/edit?token=<token>`
4. Admin approves at `/admin/submissions` → creates job record + sends approval email

## AI Prefill (`/api/prefill-job`)

4-tier extraction: JSON-LD → embedded JS state → OG/meta tags → Gemini 2.5 Flash (fallback only if tier 1 didn't find title + company). SSRF-protected (DNS + private IP blocklist). Only runs if `GEMINI_API_KEY` is set — gracefully skips if missing.

## Database Schema

Main tables: `jobs`, `job_submissions` (pending HR queue), `admin_users` (FK to `auth.users`).

`jobs` key fields: `title`, `company`, `url`, `description` (HTML), `tags` (TEXT[]), `work_mode` (remote|hybrid|onsite), `job_type` (internship|graduate|part-time|full-time|casual|contract), `is_active`, `is_sponsored`, `source` (manual|external_api|submission), `external_id`.

GIN index on `tags[]`. Unique constraint on `(source, external_id)` for deduplication.

## Types & Utilities

- `lib/types.ts` — All DB types + Insert/Update variants. Use these at query sites.
- `lib/utils.ts` — `cn()` (clsx+twMerge), date helpers, `normalizeJobType()`, `normalizeWorkMode()`, `generateJobHash()` (SHA256), pagination helpers.
- `lib/email-templates.ts` — Resend HTML email templates (submission confirmation, approval, rejection).

## Environment Variables

Required: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL`

Optional (graceful fallback if missing): `GEMINI_API_KEY`, `RESEND_API_KEY`

## Styling

Tailwind CSS. Brand colors defined as CSS variables in `app/globals.css` (`--mmss-primary: #3d1472`, `--mmss-secondary: #5b2d8e`). Single app font: Public Sans, loaded once in `app/layout.tsx` via `next/font/google` (`variable: '--font-public-sans'`) — both `--font-sans` and `--font-heading` resolve to it, so `font-sans`/`font-heading` are interchangeable today; `font-heading` is the one used at call sites that care about heading weight/tracking, so a future split back into two fonts only means repointing that one token. Custom UI primitives in `components/ui/` — no external component library. Popover-style components pulled from the shadcn CLI (`components/shadcn/`) ship with a literal `dark` class on their Content element — not a `dark:` variant, the actual class — which force-activates every `dark:` rule regardless of theme; since this app never turns dark mode on, that renders as a solid near-black panel. Strip the literal `dark` token (leave `dark:`-prefixed rules alone) from any newly-added `*Content`/`*SubContent` component before using it. Verifying a CSS custom property that's defined in `app/globals.css` but not yet consumed anywhere requires reading the property's value directly (`getComputedStyle(document.documentElement).getPropertyValue(...)`), not probing a utility class constructed at runtime (`el.className = 'bg-whatever'`) — Tailwind's JIT only generates a utility for a class name it finds literally, at build time, in scanned source, so a class that's never been typed in any `.ts`/`.tsx` file won't exist yet regardless of how fresh the dev server is. This cost a full investigation cycle (looked like a stale-cache bug; a clean `.next` wipe + restart didn't change anything, which was the actual tell) and will recur every time a token is added before its first real consumer.

## Known Issues

See `docs/ARCHITECTURE.md` for capability status. Notable: `app/page.tsx` and `app/jobs/page.tsx` are intentionally identical (deferred refactor). External job sync (cron) was removed and is non-functional.
