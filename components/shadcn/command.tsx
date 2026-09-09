"use client"

import * as React from "react"
import { Command as CommandPrimitive } from "cmdk"
import { MagnifyingGlassIcon } from "@phosphor-icons/react"

import { cn } from "@/lib/utils"

/**
 * cmdk wrapper, trimmed to what this app uses.
 *
 * The registry template also ships CommandDialog, which wraps the whole thing
 * in a Dialog for a global command palette. There is no Dialog primitive in
 * this folder and no command-palette feature, so it is left out rather than
 * pulled in unused — add it alongside a Dialog if that ever lands.
 *
 * Styling follows the floating-surface convention PR #27 settled on: rows are
 * rounded-sm and take their focus colours from the accent tokens, matching
 * DropdownMenuItem exactly. The panel chrome (rounded-md, border, bg-popover,
 * p-1, shadow) lives on PopoverContent, not here, so Command stays transparent
 * and composes inside any surface.
 */
function Command({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      data-slot="command"
      className={cn("flex h-full w-full flex-col overflow-hidden", className)}
      {...props}
    />
  )
}

function CommandInput({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <div
      data-slot="command-input-wrapper"
      className="flex items-center gap-2 border-b border-border px-2"
    >
      <MagnifyingGlassIcon className="size-4 shrink-0 text-muted-foreground" />
      <CommandPrimitive.Input
        data-slot="command-input"
        className={cn(
          "flex h-9 w-full bg-transparent py-2 text-sm outline-hidden placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      />
    </div>
  )
}

function CommandList({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      data-slot="command-list"
      className={cn(
        "max-h-64 scroll-py-1 overflow-x-hidden overflow-y-auto",
        className
      )}
      {...props}
    />
  )
}

function CommandEmpty({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      className={cn("py-5 text-center text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function CommandGroup({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      className={cn(
        "overflow-hidden p-1 text-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

function CommandSeparator({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Separator>) {
  return (
    <CommandPrimitive.Separator
      data-slot="command-separator"
      className={cn("-mx-1 my-1 h-px bg-foreground/5", className)}
      {...props}
    />
  )
}

function CommandItem({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      className={cn(
        // data-[disabled=true], not data-disabled. Tailwind compiles the
        // bare form to `[data-disabled]`, which matches on attribute
        // *presence* — and cmdk renders data-disabled="false" on every
        // enabled item, so the bare variant put pointer-events:none and
        // opacity-50 on all of them and no row could be clicked at all.
        // dropdown-menu.tsx keeps the bare form correctly: Radix omits the
        // attribute entirely when the item is enabled.
        "relative flex cursor-default items-center gap-2.5 rounded-sm px-2 py-1.5 text-sm font-medium outline-hidden select-none data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  )
}

export {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
}
