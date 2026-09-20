'use client'

import { useState } from 'react'
import { Modal, Button } from '@/components/ui'
import {
  segmentedTabsListClassName,
  segmentedTabsTriggerClassName,
} from '@/components/ui/segmented-tabs'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/shadcn/tooltip'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/shadcn/popover'
import { Usage } from '../components/usage'
import { Note } from '../components/note'

/**
 * Everything the two style pages shipped without documenting.
 *
 * These were not deliberate omissions so much as the parts nobody thought to
 * add: the utility layer in particular is a second, parallel button and card
 * system living in @utility blocks in globals.css, which no component
 * imports and no page mentioned.
 *
 * Each specimen renders the real thing and carries its route provenance, so
 * "is this still used" is answerable rather than assumed.
 */

function Item({
  title,
  file,
  noteId,
  warning,
  children,
}: {
  title: string
  file?: string
  noteId: string
  warning?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-3 rounded-xl bg-slate-50 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[13px] font-medium text-slate-900">{title}</h3>
        <Note id={noteId} label={title} />
      </div>
      <div>{children}</div>
      {warning && <p className="text-[11px] leading-snug text-slate-500">{warning}</p>}
      {file && <Usage file={file} />}
    </div>
  )
}

export function UndocumentedBlock() {
  const [tab, setTab] = useState('pending')
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Item
        title="Segmented tabs"
        file="components/ui/segmented-tabs.tsx"
        noteId="segmented-tabs"
        warning="Hard-coded slate — the sliders cannot move it."
      >
        <div className={segmentedTabsListClassName}>
          {['pending', 'approved', 'rejected'].map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={segmentedTabsTriggerClassName(tab === t)}
            >
              {t}
            </button>
          ))}
        </div>
      </Item>

      <Item title="Tooltip" file="components/shadcn/tooltip.tsx" noteId="tooltip">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" variant="outline">
                Hover me
              </Button>
            </TooltipTrigger>
            <TooltipContent>Distinct viewers, last 30 days</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </Item>

      <Item title="Popover" file="components/shadcn/popover.tsx" noteId="popover">
        <Popover>
          <PopoverTrigger asChild>
            <Button size="sm" variant="outline">
              Open popover
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 text-xs">
            The surface behind the tag combobox and the date range picker.
          </PopoverContent>
        </Popover>
      </Item>

      <Item title="Modal" file="components/ui/modal.tsx" noteId="modal">
        <Button size="sm" variant="outline" onClick={() => setModalOpen(true)}>
          Open modal
        </Button>
        <Modal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title="Reject submission"
          description="The submitter is emailed the note below."
          footer={
            <>
              <Button size="sm" variant="ghost" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" variant="destructive" onClick={() => setModalOpen(false)}>
                Reject
              </Button>
            </>
          }
        >
          <p className="text-sm text-muted-foreground">
            Replaces the native confirm dialog, which renders as
            &ldquo;jobs.monashmss.com says…&rdquo;.
          </p>
        </Modal>
      </Item>

      <Item
        title="Focus ring"
        noteId="focus-ring"
        warning="Global rule: *:focus-visible, ring-2 with an offset."
      >
        <div className="flex flex-wrap gap-2">
          <Button size="sm">Tab to me</Button>
          <Button size="sm" variant="outline">
            Then me
          </Button>
        </div>
      </Item>

      <Item
        title="Page texture"
        noteId="noise"
        warning="An inline SVG noise data URI on body, 0.04 opacity."
      >
        <div className="h-12 rounded-md border border-border bg-background" />
      </Item>
    </div>
  )
}

/**
 * The @utility layer — a parallel component system defined in globals.css
 * that nothing in components/ imports. Rendered as plain elements carrying
 * only the utility class, which is exactly how a call site would use it.
 */
export function UtilityLayerBlock() {
  return (
    <div className="space-y-3">
      <p className="text-[13px] leading-relaxed text-slate-500">
        <code>.btn-primary</code> and <code>&lt;Button variant=&quot;primary&quot;&gt;</code> are two
        implementations of one button. Any divergence has to be fixed twice.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-primary btn-sm">
          .btn-primary
        </button>
        <button type="button" className="btn btn-secondary btn-sm">
          .btn-secondary
        </button>
        <button type="button" className="btn btn-outline btn-sm">
          .btn-outline
        </button>
        <button type="button" className="btn btn-ghost btn-sm">
          .btn-ghost
        </button>
        <button type="button" className="btn btn-destructive btn-sm">
          .btn-destructive
        </button>
      </div>

      <div className="grid items-start gap-2 sm:grid-cols-3">
        <div className="card p-3">
          <p className="text-xs font-medium text-foreground">.card</p>
          <p className="text-[11px] text-muted-foreground">shadow-xs, not the Card component</p>
        </div>
        <div className="auth-card">
          <p className="text-xs font-medium text-foreground">.auth-card</p>
          <p className="text-[11px] text-muted-foreground">login surface</p>
        </div>
        <input className="input-base" placeholder=".input-base" />
      </div>


    </div>
  )
}
