'use client'

import { useState } from 'react'
import { Button, Input, Badge, Modal } from '@/components/ui'
import type { VariantUsageReport } from '../lib/scan'

const BUTTON_VARIANTS = ['primary', 'secondary', 'outline', 'ghost', 'destructive', 'link'] as const
const BUTTON_SIZES = ['sm', 'md', 'lg'] as const
const BADGE_VARIANTS = ['default', 'secondary', 'outline', 'success', 'warning', 'destructive'] as const

function UnusedFlag({ used }: { used: boolean }) {
  if (used) return null
  return (
    <span className="rounded bg-warning/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-warning-foreground/80 ring-1 ring-warning/30">
      unused
    </span>
  )
}

function usageFor(reports: VariantUsageReport[], component: string, prop: 'variant' | 'size', value: string) {
  const report = reports.find((r) => r.component === component && r.prop === prop)
  return report?.values.find((v) => v.value === value)
}

export function ComponentsSection({ variantReports }: { variantReports: VariantUsageReport[] }) {
  const [dialogOpen, setDialogOpen] = useState(false)

  return (
    <section className="space-y-10">
      <header>
        <h2 className="text-2xl font-semibold text-foreground">6. Components</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Live instances imported directly from <code>components/ui</code> and{' '}
          <code>components/shadcn</code> — not recreated. &ldquo;Unused&rdquo; is a best-effort static
          scan of JSX usage across <code>app/</code>, <code>components/</code>, and <code>lib/</code>;
          it can miss a variant chosen via a runtime expression, so treat it as a lead, not a verdict.
        </p>
      </header>

      {/* Button */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Button</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr>
                <th className="px-2 py-2 font-medium text-muted-foreground">variant \ size</th>
                {BUTTON_SIZES.map((size) => (
                  <th key={size} className="px-2 py-2 font-medium text-muted-foreground">
                    {size}
                    <UnusedFlag used={(usageFor(variantReports, 'Button', 'size', size)?.count ?? 0) > 0} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {BUTTON_VARIANTS.map((variant) => (
                <tr key={variant} className="border-t border-border">
                  <td className="px-2 py-3 align-middle text-xs font-medium text-foreground">
                    {variant}{' '}
                    <UnusedFlag used={(usageFor(variantReports, 'Button', 'variant', variant)?.count ?? 0) > 0} />
                  </td>
                  {BUTTON_SIZES.map((size) => (
                    <td key={size} className="px-2 py-3 align-middle">
                      <Button variant={variant} size={size}>
                        Apply
                      </Button>
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="border-t border-border">
                <td className="px-2 py-3 text-xs font-medium text-foreground">
                  icon size{' '}
                  <UnusedFlag used={(usageFor(variantReports, 'Button', 'size', 'icon')?.count ?? 0) > 0} />
                </td>
                <td className="px-2 py-3" colSpan={3}>
                  <Button variant="outline" size="icon" aria-label="icon example">
                    →
                  </Button>
                </td>
              </tr>
              <tr className="border-t border-border">
                <td className="px-2 py-3 text-xs font-medium text-foreground">loading</td>
                <td className="px-2 py-3" colSpan={3}>
                  <Button loading>Submitting</Button>
                </td>
              </tr>
              <tr className="border-t border-border">
                <td className="px-2 py-3 text-xs font-medium text-foreground">disabled</td>
                <td className="px-2 py-3" colSpan={3}>
                  <Button disabled>Apply</Button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Input */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Input</h3>
        <div className="grid max-w-xl grid-cols-1 gap-4 sm:grid-cols-2">
          <Labeled label="default">
            <Input placeholder="Company name" />
          </Labeled>
          <Labeled label="disabled">
            <Input placeholder="Company name" disabled />
          </Labeled>
          <Labeled label="error">
            <Input placeholder="Company name" error="Company name is required" />
          </Labeled>
          <Labeled label="filled">
            <Input defaultValue="Monash Marketing Students' Society" />
          </Labeled>
        </div>
      </div>

      {/* Badge */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Badge</h3>
        <div className="flex flex-wrap gap-3">
          {BADGE_VARIANTS.map((variant) => (
            <div key={variant} className="flex items-center gap-1.5">
              <Badge variant={variant}>{variant}</Badge>
              <UnusedFlag used={(usageFor(variantReports, 'Badge', 'variant', variant)?.count ?? 0) > 0} />
            </div>
          ))}
        </div>
      </div>

      {/* Dialog trigger (Modal) */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Dialog trigger
        </h3>
        <p className="text-xs text-muted-foreground/80">
          There is no Radix-style <code>Dialog</code> primitive in this codebase — the branded
          equivalent is <code>components/ui/modal.tsx</code>, a controlled <code>open</code>/
          <code>onClose</code> component (see also <code>useConfirmDialog</code> for the imperative
          form). This is that real component, opened by a real trigger button.
        </p>
        <Button variant="outline" onClick={() => setDialogOpen(true)}>
          Open dialog
        </Button>
        <Modal
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          title="Reject submission"
          description="This sends a rejection email to the submitter with your note attached."
          footer={
            <>
              <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" size="sm" onClick={() => setDialogOpen(false)}>
                Reject
              </Button>
            </>
          }
        >
          <p className="text-sm text-muted-foreground">
            Dialog body content goes here — this instance is the real Modal, not a mock.
          </p>
        </Modal>
      </div>

      {/* DropdownMenu / Tooltip */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          DropdownMenu &amp; Tooltip
        </h3>
        <p className="text-xs text-muted-foreground/80">
          Both now live in <code>components/shadcn/</code> — this note is stale, the gap it described
          landed. <code>Tooltip</code> is used throughout this page&apos;s own action buttons (see any{' '}
          <code>IconActionButton</code> above); <code>DropdownMenu</code> gets its own comparison
          below (section 7) rather than a single instance here, since the PR #24 treatment question
          is exactly what that section exists to show.
        </p>
      </div>
    </section>
  )
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      {children}
    </div>
  )
}
