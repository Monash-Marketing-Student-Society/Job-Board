'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const TABS = [
  { href: '/admin/style', label: 'Reference' },
  { href: '/admin/style/preview', label: 'Preview' },
]

/**
 * Shared tab bar for the two internal design-system pages: the token-by-token
 * audit at /admin/style ("Reference") and the composed-blocks page at
 * /admin/style/preview ("Preview"). Split because they answer different
 * questions — Reference proves what a token currently resolves to in
 * isolation, Preview shows how a set of tokens reads once real UI is built
 * out of them side by side — and neither replaces the other.
 */
export default function StyleLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div>
      <nav className="mb-10 flex items-center gap-1 border-b border-border">
        {TABS.map((tab) => {
          const active = pathname === tab.href
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                '-mb-px border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
                active
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {tab.label}
            </Link>
          )
        })}
      </nav>
      {children}
    </div>
  )
}
