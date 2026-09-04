"use client"

import * as React from "react"
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { CheckIcon, CaretRightIcon } from "@phosphor-icons/react"

function DropdownMenu({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  return <DropdownMenuPrimitive.Root data-slot="dropdown-menu" {...props} />
}

function DropdownMenuPortal({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Portal>) {
  return (
    <DropdownMenuPrimitive.Portal data-slot="dropdown-menu-portal" {...props} />
  )
}

function DropdownMenuTrigger({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
  return (
    <DropdownMenuPrimitive.Trigger
      data-slot="dropdown-menu-trigger"
      {...props}
    />
  )
}

function DropdownMenuContent({
  className,
  align = "start",
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        align={align}
        className={cn(
                                  // Registry template ships this with a literal `dark` class — not a
                                  // `dark:` variant, the actual class — which forces every dark: rule
                                  // below active regardless of the page's theme. This app never
                                  // activates dark mode (see globals.css), so that made the panel
                                  // render as a solid near-black box. Dropped; every `dark:`-prefixed
                                  // rule stays, since those are conditional and harmless when unused.
                                  //
                                  // Also dropped from the registry template: two unconditional (not
                                  // even focus-gated) `**:data-[variant=destructive]:text-accent-foreground!`
                                  // rules that !important-overrode every destructive item's own
                                  // `data-[variant=destructive]:text-destructive` back to near-black,
                                  // in both its resting and focused states — DropdownMenuItem's
                                  // variant="destructive" was silently a no-op wherever it was used
                                  // inside this Content (found via job-table.tsx's Delete item
                                  // rendering black instead of red). The focus-background
                                  // neutralization on the last line below
                                  // (`**:data-[variant=destructive]:focus:bg-foreground/10!`) is a
                                  // separate, still-intentional keep from that same fix — only the
                                  // text-color overrides were the bug — now standing on its own since
                                  // the general item hover just below no longer shares its value.
                                  //
                                  // border border-border restored (previously dropped): the earlier
                                  // removal matched this to a "stock shadcn" reference that turned out
                                  // not to be stock shadcn — real upstream DropdownMenuContent ships
                                  // with a border. Correction, not a re-departure.
                                  //
                                  // **:data-[slot$=-item]:focus/data-highlighted:bg-foreground/10 —
                                  // removed. DropdownMenuItem already carries its own
                                  // focus:bg-accent focus:text-accent-foreground; this Content-level
                                  // wildcard was silently shadowing it (confirmed via getComputedStyle
                                  // on a real focused item, not assumed — the resolved background was
                                  // --foreground/10, never --accent, regardless of theme). Checked
                                  // before removing whether data-highlighted was covering a state
                                  // :focus doesn't: on this Radix version, keyboard nav and pointer
                                  // hover both move real DOM focus via roving tabindex (verified live,
                                  // both paths), so data-highlighted and :focus always co-occur here —
                                  // nothing was load-bearing.
                                  //
                                  // **:data-[slot$=-trigger]:focus/aria-expanded:bg-foreground/10 —
                                  // also removed, same shape as the item fix: DropdownMenuSubTrigger
                                  // already carries its own focus:bg-accent (for plain focus) and
                                  // data-open:bg-accent (for "my submenu is open", independent of
                                  // where focus currently is — data-open resolves via
                                  // [data-state='open'], see the @custom-variant in globals.css). This
                                  // one couldn't be verified live the same way — DropdownMenuSubTrigger
                                  // has zero call sites anywhere in the app, so there's no real submenu
                                  // to open and inspect. Checked what it rests on instead, from source:
                                  // the [data-state='open'] mapping is real (globals.css), SubTrigger's
                                  // own data-open:bg-accent is unconditional and not itself shadowed by
                                  // anything else in this file. aria-expanded persisting while :focus
                                  // sits on a child item inside the open submenu (the case that would
                                  // make this unsafe) is exactly the state data-open:bg-accent exists
                                  // to cover independently of :focus — removing the wildcard doesn't
                                  // leave that state unpainted, it just stops it being painted wrong.
                                  //
                                  // The separator wildcard below is untouched: different component,
                                  // not what was asked. DropdownMenuSubContent below carries the
                                  // identical border/item-wildcard/trigger-wildcard pattern and hasn't
                                  // been touched either — it has zero call sites anywhere in the app,
                                  // same as select.tsx before its own dark-class removal.
                                  "z-50 max-h-(--radix-dropdown-menu-content-available-height) w-(--radix-dropdown-menu-trigger-width) min-w-48 origin-(--radix-dropdown-menu-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:overflow-hidden data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 animate-none! **:data-[slot$=-separator]:bg-foreground/5 **:data-[variant=destructive]:focus:bg-foreground/10!",
                                  className
                                )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  )
}

function DropdownMenuGroup({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Group>) {
  return (
    <DropdownMenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />
  )
}

function DropdownMenuItem({
  className,
  inset,
  variant = "default",
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & {
  inset?: boolean
  variant?: "default" | "destructive"
}) {
  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(
        "group/dropdown-menu-item relative flex cursor-default items-center gap-2.5 rounded-sm px-2 py-1.5 text-sm font-medium outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-inset:pl-9.5 data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:focus:text-destructive dark:data-[variant=destructive]:focus:bg-destructive/20 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 data-[variant=destructive]:*:[svg]:text-destructive",
        className
      )}
      {...props}
    />
  )
}

function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  inset,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem> & {
  inset?: boolean
}) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      data-inset={inset}
      className={cn(
        "relative flex cursor-default items-center gap-2.5 rounded-sm py-1.5 pr-8 pl-2 text-sm font-medium outline-hidden select-none focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground data-inset:pl-9.5 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      checked={checked}
      {...props}
    >
      <span
        className="pointer-events-none absolute right-2 flex items-center justify-center"
        data-slot="dropdown-menu-checkbox-item-indicator"
      >
        <DropdownMenuPrimitive.ItemIndicator>
          <CheckIcon
          />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  )
}

function DropdownMenuRadioGroup({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioGroup>) {
  return (
    <DropdownMenuPrimitive.RadioGroup
      data-slot="dropdown-menu-radio-group"
      {...props}
    />
  )
}

function DropdownMenuRadioItem({
  className,
  children,
  inset,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioItem> & {
  inset?: boolean
}) {
  return (
    <DropdownMenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      data-inset={inset}
      className={cn(
        "relative flex cursor-default items-center gap-2.5 rounded-sm py-1.5 pr-8 pl-2 text-sm font-medium outline-hidden select-none focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground data-inset:pl-9.5 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <span
        className="pointer-events-none absolute right-2 flex items-center justify-center"
        data-slot="dropdown-menu-radio-item-indicator"
      >
        <DropdownMenuPrimitive.ItemIndicator>
          <CheckIcon
          />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  )
}

function DropdownMenuLabel({
  className,
  inset,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Label> & {
  inset?: boolean
}) {
  return (
    <DropdownMenuPrimitive.Label
      data-slot="dropdown-menu-label"
      data-inset={inset}
      className={cn(
        "px-3 py-2.5 text-xs text-muted-foreground data-inset:pl-9.5",
        className
      )}
      {...props}
    />
  )
}

function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn("-mx-1.5 my-1.5 h-px bg-border/50", className)}
      {...props}
    />
  )
}

function DropdownMenuShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={cn(
        "ml-auto text-xs tracking-widest text-muted-foreground group-focus/dropdown-menu-item:text-accent-foreground",
        className
      )}
      {...props}
    />
  )
}

function DropdownMenuSub({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Sub>) {
  return <DropdownMenuPrimitive.Sub data-slot="dropdown-menu-sub" {...props} />
}

function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubTrigger> & {
  inset?: boolean
}) {
  return (
    <DropdownMenuPrimitive.SubTrigger
      data-slot="dropdown-menu-sub-trigger"
      data-inset={inset}
      className={cn(
        "flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm font-medium outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-inset:pl-9.5 data-open:bg-accent data-open:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      {children}
      <CaretRightIcon className="ml-auto" />
    </DropdownMenuPrimitive.SubTrigger>
  )
}

function DropdownMenuSubContent({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubContent>) {
  return (
    <DropdownMenuPrimitive.SubContent
      data-slot="dropdown-menu-sub-content"
      className={cn(
                        // Same forced-`dark` fix and destructive-text-color fix as
                        // DropdownMenuContent above. border border-border restored
                        // here too, same correction and same reason (see that
                        // function's comment) — this file has zero call sites
                        // anywhere in the app, so nothing to re-verify live, but
                        // the divergence was identical and there's no reason for
                        // this one to stay wrong just because it's unused.
                        //
                        // Update: the item/trigger hover wildcards below are now
                        // also removed, mirroring DropdownMenuContent's fix
                        // (2969fb8, e84f165) — this function was left out of
                        // scope the first two times, not because the pattern was
                        // different. DropdownMenuItem already carries its own
                        // focus:bg-accent focus:text-accent-foreground, and
                        // DropdownMenuSubTrigger already carries its own
                        // focus:bg-accent and data-open:bg-accent (the latter via
                        // [data-state='open'], see the @custom-variant in
                        // globals.css) — both were being shadowed here the same
                        // way DropdownMenuContent's copies were. Source-verified
                        // only, not live: this function has zero call sites
                        // anywhere in the app, so there's nothing to open and
                        // inspect with getComputedStyle the way the Content fixes
                        // were confirmed. What was checked is that nothing else in
                        // this file shadows DropdownMenuItem's or
                        // DropdownMenuSubTrigger's own accent classes besides the
                        // wildcard just removed.
                        "z-50 min-w-36 origin-(--radix-dropdown-menu-content-transform-origin) overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 animate-none! **:data-[slot$=-separator]:bg-foreground/5 **:data-[variant=destructive]:focus:bg-foreground/10!",
                        className
                      )}
      {...props}
    />
  )
}

export {
  DropdownMenu,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
}
