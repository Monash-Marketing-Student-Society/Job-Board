'use client'

import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

export interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children?: React.ReactNode
  footer?: React.ReactNode
  className?: string
}

/**
 * Branded modal used in place of the browser's native `confirm` / `prompt`.
 *
 * Native dialogs render as "jobs.monashmss.com says…" with no styling, which
 * looks like a phishing prompt rather than part of the product — and they
 * cannot carry a warning, which the rejection-note flow needs.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  // Escape closes; focus moves into the dialog so keyboard users are not left
  // behind on the page underneath.
  useEffect(() => {
    if (!open) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', onKeyDown)

    const previouslyFocused = document.activeElement as HTMLElement | null
    const firstField = panelRef.current?.querySelector<HTMLElement>(
      'input, textarea, button'
    )
    firstField?.focus()

    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = overflow
      previouslyFocused?.focus()
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
        onClick={onClose}
      />

      <div
        ref={panelRef}
        className={cn(
          'relative w-full max-w-md bg-white rounded-lg border border-slate-200',
          'shadow-[0_10px_40px_rgba(0,0,0,0.18)] overflow-hidden',
          className
        )}
      >
        <div className="px-5 pt-5 pb-4">
          <h2 className="text-[17px] font-semibold text-slate-800 font-heading">
            {title}
          </h2>
          {description && (
            <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">
              {description}
            </p>
          )}
          {children && <div className="mt-4">{children}</div>}
        </div>

        {footer && (
          <div className="px-5 py-4 flex justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
