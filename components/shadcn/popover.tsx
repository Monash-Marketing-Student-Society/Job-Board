"use client"

import * as React from "react"
import { Popover as PopoverPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Popover({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

function PopoverTrigger({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

function PopoverAnchor({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />
}

function PopoverContent({
  className,
  align = "start",
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          // Mirrors DropdownMenuContent in this folder, swapping the Radix CSS
          // vars for the popover ones. Same floating-surface convention PR #27
          // settled on across every *Content: rounded-md, border-border,
          // bg-popover, p-1 — so rows inside sit in a 4px gutter.
          //
          // Width follows the trigger, as DropdownMenuContent already does here,
          // which is what a combobox panel wants. Override at the call site if a
          // future popover needs to be wider than what opened it.
          //
          // `animate-none!` is carried over deliberately: every other floating
          // surface in this folder renders static despite shipping the enter/exit
          // classes, and a popover that animated while menus didn't would read as
          // a bug. The classes stay so removing the override re-enables all of
          // them together.
          //
          // The registry template's literal `dark` class (not a `dark:` variant)
          // is dropped, same as dropdown-menu.tsx — this app never activates dark
          // mode, so it forced every dark: rule on and painted the panel near-black.
          "z-50 max-h-(--radix-popover-content-available-height) w-(--radix-popover-trigger-width) min-w-48 origin-(--radix-popover-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md outline-hidden duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 animate-none!",
          className
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
}

export { Popover, PopoverTrigger, PopoverAnchor, PopoverContent }
