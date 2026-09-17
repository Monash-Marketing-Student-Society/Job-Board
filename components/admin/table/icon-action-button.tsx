'use client'

import { forwardRef } from 'react'
import { Button, type ButtonProps } from '@/components/ui'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/shadcn/tooltip'
import { cn } from '@/lib/utils'
import { CHIP_SHAPE } from './table-styles'

interface IconActionButtonProps extends ButtonProps {
  /** Accessible name — always required. Doubles as the Tooltip's label unless `tooltip` is false. */
  label: string
  /**
   * False for triggers that shouldn't show a hover label — a DropdownMenu's
   * ellipsis, mainly, where the menu it opens is the affordance, not a
   * single named action. Ref-forwarding still works either way, so this
   * still composes with `DropdownMenuTrigger asChild`.
   */
  tooltip?: boolean
}

export const IconActionButton = forwardRef<HTMLButtonElement, IconActionButtonProps>(
  ({ label, tooltip = true, className, children, ...props }, ref) => {
    const button = (
      <Button
        ref={ref}
        type="button"
        variant="ghost"
        size="icon"
        aria-label={label}
        // Chip geometry (32px / 14px), same as a status tab — see table-styles.
        className={cn(CHIP_SHAPE, className)}
        {...props}
      >
        {children}
      </Button>
    )

    if (!tooltip) return button

    return (
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    )
  }
)

IconActionButton.displayName = 'IconActionButton'
