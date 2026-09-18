'use client'

import { cn } from '@/lib/utils'
import { checkboxClassName } from './table-styles'

/**
 * Native checkbox for table selection, with the admin tables' focus ring and
 * an `indeterminate` state for a select-all control over a partial selection.
 * `indeterminate` has no HTML attribute — it only exists as a DOM property —
 * so it's set through the ref on every render.
 */
export function SelectCheckbox({
  checked,
  indeterminate = false,
  onChange,
  label,
  className,
}: {
  checked: boolean
  indeterminate?: boolean
  onChange: () => void
  label: string
  className?: string
}) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={checked}
      onChange={onChange}
      ref={(el) => {
        if (el) el.indeterminate = indeterminate
      }}
      className={cn(checkboxClassName, className)}
    />
  )
}
