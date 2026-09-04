'use client'

import { DotsThreeVerticalIcon } from '@phosphor-icons/react'
import { IconActionButton } from '@/components/admin/table'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/shadcn/dropdown-menu'

/**
 * The PR #24 dark-menu incident and the three treatments compared against
 * it (elevated / frosted / flat-bordered) are recorded in
 * docs/ARCHITECTURE.md, not repeated here — this section is just the
 * outcome: DropdownMenuContent exactly as it ships, no call-site classes,
 * proven with two real, openable instances rather than asserted.
 */

/** Real content from JobActionsMenu's active-job branch (job-table.tsx) — not lorem. */
function ActionListDemo() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconActionButton label="Job row actions" tooltip={false} className="text-muted-foreground">
          <DotsThreeVerticalIcon weight="bold" className="size-4" />
        </IconActionButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-40">
        <DropdownMenuItem asChild>
          <a href="#">Edit</a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem>Deactivate</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Real content from SubmissionActionsMenu (submissions-table.tsx) — not lorem. */
function MetadataPanelDemo() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconActionButton label="Submission actions" tooltip={false} className="text-muted-foreground">
          <DotsThreeVerticalIcon weight="bold" className="size-4" />
        </IconActionButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuItem>Archive</DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuLabel>Submitted by</DropdownMenuLabel>
        <div className="px-3 pb-2 -mt-1 space-y-0.5">
          <p className="text-sm font-medium text-popover-foreground">Ami Cowburn</p>
          <p className="text-xs text-muted-foreground truncate">ami.cowburn@gmail.com</p>
          <p className="text-xs text-muted-foreground truncate">Monash Marketing Student Society</p>
        </div>
        <div className="px-3 pb-2 text-xs text-muted-foreground">
          <span className="capitalize">Internship · Hybrid · </span>
          Submitted 17 Aug 2026
        </div>

        <DropdownMenuSeparator />
        <DropdownMenuLabel>Sent to submitter</DropdownMenuLabel>
        <p className="px-3 pb-2 -mt-1 text-xs text-muted-foreground">This is pre-penultimate</p>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function DropdownMenuSection() {
  return (
    <section className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold text-foreground">7. Dropdown menu</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          <code>DropdownMenuContent</code> as it ships — no call-site classes, this is the component's
          own default. Two real, openable instances below with the actual content from the two call
          sites this affects: the row-actions list (<code>JobActionsMenu</code>) and the wider metadata
          panel (<code>SubmissionActionsMenu</code>). Click a ⋮ to open.
        </p>
      </header>

      <div className="max-w-md space-y-3 rounded-md border border-border p-4">
        <p className="text-xs text-muted-foreground">
          White popover, hairline border, shadow-md, rounded-md, and <code>DropdownMenuItem</code>&apos;s
          own accent hover — nothing added at the call site to get this; it&apos;s what rendering{' '}
          <code>&lt;DropdownMenuContent&gt;</code> with no extra <code>className</code> produces today.
        </p>
        <div className="flex items-center gap-6 pt-1">
          <div className="flex flex-col items-center gap-1.5">
            <ActionListDemo />
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Actions</span>
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <MetadataPanelDemo />
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Metadata</span>
          </div>
        </div>
      </div>

      <p className="max-w-2xl text-xs text-muted-foreground/80">
        Three other treatments were built and compared here before landing on this one: a more elevated
        surface (stronger shadow, a touch tighter radius, a solid muted hover row), passed on because
        this app&apos;s radius scale has no meaningfully tighter step to reach for without adding a new
        token; a frosted/translucent surface reusing <code>select.tsx</code>&apos;s unused blur treatment
        on light tokens, passed on because it needed an added border just to stay legible against the
        page and didn&apos;t earn that extra mechanism over a plain surface; and a flat, borderless,
        denser surface matching the table&apos;s own visual weight, passed on because it read as
        under-styled next to the rest of the admin UI. Stock shadcn — this one — won on being
        unremarkable: no new token, no new mechanism, already consistent with every other floating
        surface in the app.
      </p>
    </section>
  )
}
