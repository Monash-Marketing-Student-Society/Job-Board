'use client'

import { useRef, useState, type KeyboardEvent } from 'react'
import { CaretUpDownIcon, CheckIcon, XIcon } from '@phosphor-icons/react'

import { cn } from '@/lib/utils'
import { JOB_FUNCTIONS, MAX_JOB_FUNCTIONS, type JobFunction } from '@/lib/tags'
import { Badge } from './badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/shadcn/popover'
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
 * The trigger is a focusable div rather than a button because it contains the
 * chips' own remove buttons, and a button may not nest a button. It carries the
 * combobox role and its own key handling to make up for what a real button
 * would have given us for free.
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

  const atMax = value.length >= max

  const toggle = (fn: JobFunction) => {
    if (value.includes(fn)) {
      onChange(value.filter((v) => v !== fn))
      return
    }
    if (atMax) return
    onChange([...value, fn])
  }

  const removeLast = () => {
    if (value.length > 0) onChange(value.slice(0, -1))
  }

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return

    // A div gets none of a button's keyboard behaviour, so Enter/Space/ArrowDown
    // have to be wired up by hand to open the panel.
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
      event.preventDefault()
      setOpen(true)
      return
    }
    if (event.key === 'Backspace') {
      event.preventDefault()
      removeLast()
    }
  }

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // Only steal Backspace once the filter is empty, so it never eats a
    // character the user is still deleting.
    if (event.key === 'Backspace' && search === '') {
      event.preventDefault()
      removeLast()
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div
          id={id}
          ref={triggerRef}
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-disabled={disabled}
          tabIndex={disabled ? -1 : 0}
          onKeyDown={handleTriggerKeyDown}
          className={cn(
            // Same fill and border tokens as Input/Textarea/NativeSelect — this
            // is a form control and should not invent its own surface.
            'flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-md border border-input bg-input px-3 py-1.5 text-sm',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            disabled && 'cursor-not-allowed opacity-50',
            className
          )}
        >
          {value.length === 0 && (
            <span className="text-muted-foreground">
              Select up to {max}…
            </span>
          )}

          {value.map((fn) => (
            // pr-1 deliberately overrides Badge's px-2.5 on the right only, to
            // sit the remove button closer to the edge. twMerge keeps pl-2.5.
            <Badge key={fn} variant="secondary" className="gap-1 pr-1">
              {fn}
              <button
                type="button"
                aria-label={`Remove ${fn}`}
                disabled={disabled}
                onClick={(event) => {
                  // Without this the click reaches the trigger and toggles the
                  // panel open on every chip removal.
                  event.stopPropagation()
                  onChange(value.filter((v) => v !== fn))
                }}
                onKeyDown={(event) => event.stopPropagation()}
                className="rounded-sm p-0.5 text-secondary-foreground/70 hover:text-secondary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <XIcon weight="bold" className="size-3" />
              </button>
            </Badge>
          ))}

          <CaretUpDownIcon className="ml-auto size-4 shrink-0 text-muted-foreground" />
        </div>
      </PopoverTrigger>

      <PopoverContent>
        <Command>
          <CommandInput
            placeholder="Filter…"
            value={search}
            onValueChange={setSearch}
            onKeyDown={handleSearchKeyDown}
          />
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
                  >
                    <CheckIcon
                      weight="bold"
                      className={cn('size-4', selected ? 'opacity-100' : 'opacity-0')}
                    />
                    {fn}
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
        </Command>
      </PopoverContent>
    </Popover>
  )
}
