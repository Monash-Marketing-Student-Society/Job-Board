'use client'

import { useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { CheckIcon, XIcon } from '@phosphor-icons/react'

import { cn } from '@/lib/utils'
import { JOB_FUNCTIONS, MAX_JOB_FUNCTIONS, type JobFunction } from '@/lib/tags'
import { Badge } from './badge'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/shadcn/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/shadcn/command'

/**
 * Multi-select over the fixed Job Function vocabulary.
 *
 * Replaces the free-text comma-separated Input this app used for tags. There is
 * deliberately no way to create a value: the list is `JOB_FUNCTIONS` and typing
 * only filters it. That is the whole point — the column had no CHECK constraint
 * and four independent write paths, so anything typed became a tag forever.
 *
 * One `<Command>` spans both halves: the control and the panel. PopoverContent
 * portals `CommandList` out of this subtree, which is safe — cmdk reaches items
 * through its own `listInnerRef` and shares state by context, so neither needs
 * the list to be a DOM descendant of the root. What does have to stay inside is
 * the input: cmdk's arrow/enter handling lives on the `Command` root div and
 * only reaches it by bubbling.
 *
 * That single change is what lets the control be composed the obvious way —
 * chips and a real text input sharing one pill. The previous split (a focusable
 * `div` here, a search row in the panel) had to hand-wire Enter/Space/ArrowDown
 * to make a div behave like a button, and wire Backspace twice, once on each
 * half. A real input holds focus now, so all of that is gone.
 */
export interface TagComboboxProps {
  id?: string
  value: JobFunction[]
  onChange: (next: JobFunction[]) => void
  max?: number
  disabled?: boolean
  className?: string
}

export function TagCombobox({
  id,
  value,
  onChange,
  max = MAX_JOB_FUNCTIONS,
  disabled,
  className,
}: TagComboboxProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const triggerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const atMax = value.length >= max

  const toggle = (fn: JobFunction) => {
    // Clearing the filter is not optional now that the input sits among the
    // chips: leaving "eve" stranded next to a fresh Events chip reads as a bug.
    setSearch('')
    if (value.includes(fn)) {
      onChange(value.filter((v) => v !== fn))
      return
    }
    if (atMax) return
    onChange([...value, fn])
  }

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // The one key this steals, and now in one place rather than two. Guarded on
    // an empty filter so it never eats a character the user is still deleting.
    if (event.key === 'Backspace' && search === '' && value.length > 0) {
      event.preventDefault()
      onChange(value.slice(0, -1))
    }
  }

  // Clicking the pill's padding, or a chip's label, should land the caret in the
  // input the way it would if this were one native field. Two exceptions, both
  // of which must keep their native mousedown: remove buttons have their own
  // job, and the input itself needs the event to place the caret at the click
  // point and to start a drag-selection.
  const focusInput = (event: MouseEvent<HTMLDivElement>) => {
    if (disabled) return
    if ((event.target as HTMLElement).closest('button, input')) return
    event.preventDefault()
    inputRef.current?.focus()
  }

  return (
    <Command
      // Command's own `h-full overflow-hidden` is meant for a panel that fills a
      // dialog. Here it wraps a form control, and the overflow clip would crop
      // the trigger's focus ring.
      className={cn('h-auto w-full overflow-visible', className)}
    >
      <Popover open={open} onOpenChange={setOpen}>
        {/*
          Anchor, not Trigger. PopoverTrigger composes an open-toggle onto click,
          which on a control whose whole surface is a text input means every
          click into the field closes the panel it just opened. Opening is driven
          off focus instead. The cost is that Radix's own "is this click on the
          trigger?" exemption keys off its triggerRef, which an Anchor never
          sets — hence the onInteractOutside guard below.
        */}
        <PopoverAnchor asChild>
          <div
            id={id}
            ref={triggerRef}
            onMouseDown={focusInput}
            className={cn(
              // Variant XA from app/combobox-proto: bg-input/50 — the same token
              // Input/Textarea/NativeSelect use, at half strength so the grey
              // page tint shows through rather than sitting on top of it. XB
              // held the identical shape at full opacity; the fill is the whole
              // difference between them.
              //
              // rounded-md, not the pill this carried before: every other
              // control on both forms — Button, Input, NativeSelect, Badge,
              // Pagination — resolves to --radius-md, and neither form
              // overrides them.
              //
              // The border is transparent at rest and only colours on focus,
              // which is NativeSelect's convention: a ring hugging the border
              // rather than Input's older offset ring, so the halo reads as part
              // of the field instead of a second outline floating off it.
              //
              // Keyed on the input specifically, not focus-within. The chips'
              // remove buttons are focusable and live inside this element too,
              // so focus-within lit the whole field up behind whichever small
              // button had focus — two rings at once, and the field claiming a
              // focus it did not have. `input` matches only the one child that
              // can be an input here.
              'flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-md border border-transparent bg-input/50 px-3 py-1.5 text-sm',
              'transition-[color,box-shadow,background-color]',
              'has-[input:focus]:border-ring has-[input:focus]:ring-3 has-[input:focus]:ring-ring/30',
              disabled && 'cursor-not-allowed opacity-50'
            )}
          >
            {value.map((fn) => (
              // bg-secondary (0.90) against the trigger's bg-input (0.968) is
              // one step down the fill ladder documented in globals.css, so the
              // chip reads as sitting on the field rather than beside it. The
              // asymmetric padding pulls the remove button in toward the right
              // edge. The radius override is gone with XA — Badge already
              // resolves to rounded-md. twMerge keeps Badge's own px-2.5 — it only drops an
              // axis utility when both sides are overridden by later classes of
              // the same weight — so what actually resolves this is the
              // cascade: Tailwind emits pl-*/pr-* after px-*, so both win.
              <Badge
                key={fn}
                variant="secondary"
                className="gap-1 pl-2.5 pr-1"
              >
                {fn}
                <button
                  type="button"
                  aria-label={`Remove ${fn}`}
                  disabled={disabled}
                  onClick={() => onChange(value.filter((v) => v !== fn))}
                  // Still needed, for a new reason. It used to stop keydowns
                  // reaching the trigger div's own handler; that handler is
                  // gone, but the button now sits inside <Command>, whose root
                  // onKeyDown does not check the event target and whose Enter
                  // branch unconditionally preventDefault()s. Without this,
                  // Enter on a remove button never activates it and toggles the
                  // highlighted row instead.
                  onKeyDown={(event) => event.stopPropagation()}
                  className="rounded-sm p-0.5 text-secondary-foreground/70 hover:text-secondary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <XIcon weight="bold" className="size-3" />
                </button>
              </Badge>
            ))}

            <CommandInput
              ref={inputRef}
              disabled={disabled}
              placeholder={value.length === 0 ? `Select up to ${max}` : ''}
              value={search}
              onValueChange={(next) => {
                setSearch(next)
                setOpen(true)
              }}
              onFocus={() => setOpen(true)}
              onMouseDown={() => setOpen(true)}
              onKeyDown={handleInputKeyDown}
              className="h-6 w-auto min-w-24 flex-1"
            />

            {/*
              Clear-all, from XA. Removing three chips one at a time is three
              trips to a 12px target; this is the escape hatch for "start over".
              Only rendered when there is something to clear, so the field has
              no trailing furniture at rest — which is also why the chevron
              stayed dropped: nothing should occupy that corner permanently.
            */}
            {value.length > 0 && !disabled && (
              <button
                type="button"
                aria-label="Clear all"
                onClick={() => {
                  onChange([])
                  setSearch('')
                  inputRef.current?.focus()
                }}
                // Same reason as the chips' remove buttons: this sits inside
                // <Command>, whose root onKeyDown ignores the event target and
                // whose Enter branch unconditionally preventDefault()s.
                onKeyDown={(event) => event.stopPropagation()}
                className="ml-auto flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <XIcon weight="bold" className="size-3.5" />
              </button>
            )}
          </div>
        </PopoverAnchor>

        <PopoverContent
          // Without this, FocusScope's mount-autofocus pulls the caret out of the
          // input and into the panel. It runs even untrapped — it only checks
          // whether focus is already inside the container, and here it never is.
          onOpenAutoFocus={(event) => event.preventDefault()}
          // Restores what PopoverTrigger would have given us: clicks inside the
          // control (a chip's remove button, the padding) are not "outside".
          onInteractOutside={(event) => {
            if (triggerRef.current?.contains(event.target as Node)) {
              event.preventDefault()
            }
          }}
        >
          <CommandList>
            <CommandEmpty>No matching tag.</CommandEmpty>
            <CommandGroup>
              {JOB_FUNCTIONS.map((fn) => {
                const selected = value.includes(fn)
                return (
                  <CommandItem
                    key={fn}
                    value={fn}
                    // Selected items stay enabled at the cap so they can be
                    // deselected; only the unreachable ones go dim.
                    disabled={atMax && !selected}
                    onSelect={() => toggle(fn)}
                    // Room for the check, which is pulled out of the flex flow
                    // and pinned right — the same shape SelectItem uses for its
                    // ItemIndicator, so the two panels agree on where a tick
                    // lives. CommandItem is already `relative`.
                    //
                    // py-2 and pl-3 are XA's row metrics: 36px tall with the
                    // label inset 12px. twMerge drops CommandItem's own py-1.5
                    // outright; px-2 survives in the string but pl-3/pr-8 win
                    // anyway, because Tailwind emits directional padding after
                    // the axis shorthand.
                    className="py-2 pl-3 pr-8"
                  >
                    {fn}
                    <span className="absolute right-2 flex size-4 items-center justify-center">
                      {selected && <CheckIcon weight="bold" />}
                    </span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
          {atMax && (
            <p className="border-t border-border px-2 py-1.5 text-xs text-muted-foreground">
              {max} is the maximum — remove one to choose another.
            </p>
          )}
        </PopoverContent>
      </Popover>
    </Command>
  )
}
