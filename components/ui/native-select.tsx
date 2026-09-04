'use client'

import { forwardRef, type SelectHTMLAttributes, type OptionHTMLAttributes } from 'react'
import { CaretDownIcon } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

/**
 * A styled native `<select>`.
 *
 * Composition rather than an `options` array, which is what it replaces: the
 * old primitive took `options={[{value, label}]}` and rendered them for you,
 * so a call site could never put a `disabled` option, an `<optgroup>`, or a
 * non-string label in the list without widening the primitive first. Children
 * cost one extra line per option and remove that ceiling entirely.
 *
 * Still a real `<select>` underneath, deliberately: it gets the platform's own
 * dropdown, keyboard handling and mobile wheel picker for free, which the Radix
 * listbox in `components/shadcn/select.tsx` has to re-implement. Reach for that
 * one only when the options need markup a native `<option>` cannot hold.
 */

/** Plain option data, for call sites that keep their choices in an array. */
export interface SelectOption {
  value: string
  label: string
}

export type NativeSelectProps = SelectHTMLAttributes<HTMLSelectElement>

const NativeSelect = forwardRef<HTMLSelectElement, NativeSelectProps>(
  ({ className, children, ...props }, ref) => {
    return (
      // Block, and deliberately not `w-full`: as a flex item this shrinks to
      // the select's own width (the filter pills), and in normal flow it fills
      // its container (the forms). One wrapper covers both.
      <div className="relative">
        <select
          ref={ref}
          data-slot="native-select"
          className={cn(
            // Two things a call site overriding these needs to know:
            //
            // `pl-3 pr-9` rather than `px-3`, because the right padding is
            // holding the space the chevron sits in — a symmetric `px-*` will
            // tuck the longest option under the icon. Override the sides
            // separately.
            //
            // The focus ring is `focus-visible:`, so an override has to use
            // that same variant. `focus:ring-1` does not replace
            // `focus-visible:ring-3`; twMerge treats them as different
            // properties and both are drawn.
            //
            // Palette is the same tokens `components/shadcn/select.tsx`'s
            // `SelectTrigger` uses for shape/focus — `border-transparent`,
            // `focus-visible:border-ring` + `ring-ring/30` — so this reads as
            // the same control family even though the popup underneath is
            // still the platform's own, not Radix's. Background is
            // `bg-input` at full strength, not `SelectTrigger`'s `bg-input/50`:
            // this and Input/Textarea share one dedicated form-field fill
            // (see --input in globals.css) deliberately distinct from
            // `bg-background` (the page fill) — the two used to coincide by
            // accident, which meant "recolor form fields" and "recolor the
            // page" were the same edit until they were split.
            //
            // Text color is `text-muted-foreground`, not `text-foreground`:
            // call sites used to hardcode `text-slate-600`, a secondary tone
            // against `bg-white`, and `muted-foreground` is the token pairing
            // that survives the switch to dark mode instead of leaving dark
            // text stranded on a dark `bg-input`.
            'flex h-10 w-full appearance-none rounded-md border border-transparent bg-input text-muted-foreground',
            'py-2 pl-3 pr-9 text-sm transition-[color,box-shadow,background-color]',
            'focus-visible:outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30',
            'disabled:cursor-not-allowed disabled:opacity-50',
            className
          )}
          {...props}
        >
          {children}
        </select>

        {/* `appearance-none` above removes the platform arrow, so this replaces
            it — same icon (`CaretDownIcon`) and color (`text-muted-foreground`)
            as `SelectTrigger`'s. Not focusable and click-through, so the whole
            control still opens the menu. */}
        <CaretDownIcon
          aria-hidden
          className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
      </div>
    )
  }
)

NativeSelect.displayName = 'NativeSelect'

export type NativeSelectOptionProps = OptionHTMLAttributes<HTMLOptionElement>

/**
 * Passed straight through. It exists so call sites read as one component
 * family, and so option styling has somewhere to live if it is ever needed —
 * browsers style `<option>` themselves and largely ignore attempts to change it.
 */
const NativeSelectOption = forwardRef<HTMLOptionElement, NativeSelectOptionProps>(
  ({ className, ...props }, ref) => (
    <option ref={ref} data-slot="native-select-option" className={className} {...props} />
  )
)

NativeSelectOption.displayName = 'NativeSelectOption'

export { NativeSelect, NativeSelectOption }
