# Architecture & Repository Map

This document is the source of truth for **what actually exists in this app**,
kept separate from the README (setup instructions) and from memory. Update it
whenever a capability's status changes — it's the thing that lets a new
session (human or AI) answer "is this real, is it finished, is it safe to
build on" without re-deriving it from the code.

Last reviewed: 2026-08-17.

---

## Capabilities

| Capability | Status | Where it lives |
|---|---|---|
| Public job browsing (search/filter/paginate, sponsored pinned) | ⚠️ Works, but implemented twice — see [Known duplication](#known-duplication) | `app/page.tsx`, `app/jobs/page.tsx` |
| Job detail panel + deep link + share | ✅ Working | `app/jobs/[id]/`, `components/jobs/job-detail-panel.tsx` |
| HR self-serve submission | ✅ Working | `app/submit/` → `POST /api/submit-job` |
| Submitter edit-by-token | ✅ Working | `app/submit/edit/` → `PATCH /api/submit-job/[token]` |
| Admin review queue (approve/reject + emails) | ✅ Working | `POST /api/admin/submissions/[id]/approve|reject` |
| Admin job CRUD | ✅ Working, including one-click reactivation (added 2026-08-17 — `JobActionsMenu`'s dropdown now offers Activate on an inactive row, no confirm dialog since reversing a deactivation is lower-stakes than the actions that already have one) | `components/admin/job-form.tsx`, `job-table.tsx` |
| Admin bulk Excel import | ✅ Working — single-sheet template, rebuilt 2026-08-17 to match the real file admins use (see [Removed capabilities](#removed-capabilities-historical-record)) | `components/admin/bulk-import.tsx`, `lib/excel-template.ts` |
| Admin auth + route protection | ✅ Working | `middleware.ts` → `lib/supabase/middleware.ts` |
| Admin password reset | ✅ Working | `app/admin/reset-password/` |
| Admin user management | ✅ Working (fixed 2026-08-09). A second admin account was granted access via direct SQL the same day rather than through this UI — not because the UI didn't work, but because doing it via `/admin/users` requires an already-authenticated admin driving a browser, which wasn't available in that session. Prefer `/admin/users` for granting access going forward; it's the audited path (server-side, logged, self-removal-guarded). | `app/api/admin/users/`, `app/api/admin/users/[id]/` |
| AI-assisted job prefill | ✅ Working (switched to Gemini 2.5 Flash 2026-08-09); AI tier fires if `GEMINI_API_KEY` is set | `app/api/prefill-job/route.ts` |
| External job sync (cron) | ❌ Removed 2026-08-09 — was never functional | — |

### Production data state

`jobs.monashmss.com` currently shows "No jobs found." Checked 2026-08-17 by
reading the production REST calls the public page itself makes — both
returned `200` with zero rows, not an error: `0` jobs with `is_active =
true`. Production has 6 total job rows (1 of which had `is_featured = true`
before the migration below dropped that column) but none currently active.
This is a data state, not a bug — noted here so it isn't mistaken for one
and re-investigated from scratch.

**Unrelated fix, same day:** the local check above required working past a
separate bug first — no migration ever granted `anon`/`authenticated`/
`service_role` base `SELECT`/`INSERT`/`UPDATE`/`DELETE` on `jobs`,
`job_submissions`, or `admin_users` (only `analytics_events`, in 0006, had
explicit grants — same root cause, same fix, already applied there).
RLS policies existed and were correct, but were unreachable without the
underlying grant. Fixed via
`supabase/migrations/0013_grant_base_table_privileges.sql`, applied to
local. **Not yet applied to production** — production's own REST calls
returned clean `200`s during the check above, so its grants are already
fine (likely applied once, outside of any tracked migration, when the
hosted project was first bootstrapped); this migration exists so a fresh
`db reset` — local or a future re-provision — doesn't silently reintroduce
the gap.

### Known duplication

`app/page.tsx` (homepage) and `app/jobs/page.tsx` are near-identical
implementations of the same job-listing view — same fetch logic, same
filter state, drifted independently (the homepage's page-reset effect is
missing `filters.sponsored` in its dependency array; `/jobs` has it). This
is the highest-value refactor candidate: unify into one shared component
before adding more listing features, or the drift will keep compounding.

### Deliberately dormant

- **`.dark` theme tokens** (`app/globals.css`) ship with the shadcn template
  and are not activated anywhere — nothing in the app carries a literal
  `.dark` class, so `--background`/`--popover`/`--foreground`/etc. always
  resolve to their light values. Briefly not true: the row overflow menus
  in `components/admin/job-table.tsx` (`JobActionsMenu`) and
  `components/admin/submissions-table.tsx` (`SubmissionActionsMenu`) each
  carried `className="dark"` on their `DropdownMenuContent` for a short
  stretch, opting those two panels into the dark palette. Reverted — both
  are back to the light `--popover`/`--popover-foreground` every other
  surface in the app uses — but not because the idea was dropped: the
  panel that reuse produced (fill, radius, item padding, no selected-state
  indicator) didn't match the actual visual reference for it, so it's
  being rebuilt against that reference rather than kept as a near-miss.
  This dormant `.dark` palette is the likely starting point again once
  that rebuild lands. Until then, treat any `.dark` class showing up here
  as that rebuild landing, not as an unrelated reintroduction to evaluate
  from scratch.

  One related infra change from that stretch, kept rather than reverted:
  `@custom-variant dark` (top of `globals.css`) was widened from
  `&:is(.dark *)` (descendants only) to `&:is(.dark, .dark *)`
  (self-inclusive) so a component can carry `className="dark"` on its own
  root and have its own `dark:`-prefixed utilities apply, not only its
  children's. Currently a no-op — nothing applies a literal `.dark`
  anywhere — kept because it's the more standard form of the selector and
  costs nothing while unused; revert alongside if it ever proves to matter.

- **AI prefill tier** (`extractWithAI` in `app/api/prefill-job/route.ts`,
  Gemini 2.5 Flash) only runs when `GEMINI_API_KEY` is set and the
  JSON-LD/embedded-state tiers came up empty. Absence of the key is not a
  bug — the other three extraction tiers still work — but real-world
  coverage drops sharply without it: verified live against a current
  Greenhouse posting (a modern client-rendered ATS with no JobPosting
  JSON-LD) and without the AI tier, company/location/tags/description all
  came back empty — only title and logo survived via OG-tag fallback. If
  prefill quality on JS-heavy ATS pages seems poor, check whether the key
  is set in Vercel first.

### Removed capabilities (historical record)

- **External job sync**: scheduled via Vercel Cron, hit `/api/sync-jobs`.
  Never worked — Cron sends GET, the sync logic only ran on POST; the
  external API URL was never configured; the adapter (`externalJobsAdapter.ts`)
  was an explicit placeholder guessing at field names for an API that was
  never integrated. Removed rather than fixed, since there was no real API
  contract to fix it against. If reintroduced, start from a known API shape.

- **Duplicate prefill implementation** (`supabase/functions/extract-job/`):
  an untracked (never committed) Supabase Edge Function that reimplemented
  the same 4-tier extraction pipeline as `/api/prefill-job`, but called
  Gemini directly via its own `GEMINI_API_KEY` instead of going through the
  Next.js route. Nothing in the app ever called it — it was fully
  disconnected. Discovered 2026-08-09 when a Gemini key set for it was
  mistaken for the main route's AI key. Its Gemini-calling logic was ported
  into `/api/prefill-job` (replacing the Anthropic tier) and the standalone
  function was deleted, along with its `supabase/config.toml` registration.

- **Featured job flag (`is_featured`)**: deprecated 2026-08-17, column
  dropped via `supabase/migrations/0012_drop_is_featured.sql`. Never grew
  past its initial scaffolding — present since the very first commit
  (2026-03-10) as a schema column, a job-form checkbox, and a badge on the
  public job detail page, but the checkbox's own promise ("highlighted on
  homepage") was never built in any commit since, and the sidebar's
  "Featured Jobs" link (`/?featured=true`) pointed at a query param
  nothing ever read. `is_sponsored` is this app's sole working promotion
  mechanism — it actually pins jobs on the public listing, which Featured
  never did. Every reference (form checkbox, public badge, admin list
  query, bulk-import column, types) was removed in the same pass as the
  migration; the bulk-import Excel template was also rebuilt in this pass
  to match the real file admins use — single `"Job Data"` sheet, no
  Featured column (see the Capabilities table above).

---

## Branch model

Trunk-based. `main` is always deployable — it's what Vercel ships — and is
never committed to directly.

```
main ─────●────●────●────●────●───────────►  protected, always deployable
           \      \       \
      feat/x    fix/y   chore/z            one unit of work, short-lived
```

**Prefixes** — chosen by risk, not by folder:

| Prefix | For |
|---|---|
| `feat/` | New user-facing capability |
| `fix/` | Something behaving wrongly |
| `chore/` | Deps, config, tooling, docs |
| `refactor/` | Behaviour-preserving restructure |
| `exp/` | Spike — may never merge |

**Rules:**
- One branch = one reviewable unit. Target under ~3 days lifetime.
- Squash-merge into `main`; delete the branch on merge.
- Commit messages: Conventional Commits (`feat:`, `fix:`, `refactor:`,
  `chore:`) so `main`'s squashed log doubles as a changelog.

## Traceability

- **This file** — capability status, kept current.
- **Conventional commit messages on `main`** — `git log --grep="^fix"`
  answers "what broke recently and why."
- **`backup/*` tags** — snapshots taken before any destructive git
  operation (rebase, force-push, branch deletion). Never deleted.

## Repository settings (target state)

These require a GitHub-authenticated session to apply and are not yet
configured — see the session's final report for exact steps:

- Protect `main`: require PR before merge, require the Vercel build check,
  block force-push.
- Default merge strategy: squash. Disable plain merge commits.
- Auto-delete head branches on merge.
