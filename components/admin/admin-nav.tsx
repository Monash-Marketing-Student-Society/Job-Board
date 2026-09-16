'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AdminNavProps {
  pendingSubmissions?: number
}

function useNavItems(pendingSubmissions: number) {
  return [
    { href: '/admin/jobs', label: 'Jobs' },
    { href: '/admin/submissions', label: 'Submissions', badge: pendingSubmissions },
    { href: '/admin/analytics', label: 'Analytics' },
    { href: '/admin/users', label: 'Admins' },
  ]
}

/** Desktop pill links. Typography, padding, item gap and shape match
 *  components/navbar.tsx's desktop nav exactly — including the outer
 *  `flex-1 justify-end`, which is what pushes this flush against the
 *  pill's right edge instead of sitting next to the logo (rendered as a
 *  direct pill sibling in app/admin/layout.tsx, not grouped with the logo
 *  in its own div, for the same reason). Active state is color-only
 *  (text-slate-900 vs text-slate-600, home's exact mechanism), not a
 *  brand-tinted color or filled pill — either read visually heavier than
 *  home's plain text at the same font-size. */
export function AdminNavDesktop({ pendingSubmissions = 0 }: AdminNavProps) {
  const pathname = usePathname()
  const navItems = useNavItems(pendingSubmissions)

  return (
    <nav className="hidden md:flex items-center justify-end flex-1 gap-[5px]">
      {navItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          style={{ fontWeight: 475, fontFamily: 'var(--font-outfit)' }}
          className={cn(
            'px-2 py-[5px] rounded-md text-[16px] uppercase tracking-[-0.01em] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap hover:bg-slate-100',
            pathname.startsWith(item.href) ? 'text-slate-900' : 'text-slate-600'
          )}
        >
          {item.label}
          {item.badge != null && item.badge > 0 && (
            <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold normal-case tracking-normal rounded-full bg-primary text-primary-foreground leading-none">
              {item.badge > 99 ? '99+' : item.badge}
            </span>
          )}
        </Link>
      ))}
      {/* View Site keeps its own bordered-button look, deliberately — it's
          the one item that jumps you off the admin section entirely, so it
          reads as an action rather than a nav destination like the others. */}
      <Link
        href="/"
        target="_blank"
        style={{ fontWeight: 475, fontFamily: 'var(--font-outfit)' }}
        className="px-2 py-[5px] rounded-md text-[16px] uppercase tracking-[-0.01em] text-slate-500 border border-slate-200 hover:bg-slate-50 transition-colors whitespace-nowrap ml-1 inline-flex items-center gap-1"
      >
        View Site
        <ArrowUpRight className="size-3.5" />
      </Link>
    </nav>
  )
}

/** Toggle + dropdown. Rendered from the header's right-hand cluster (not
 *  beside the logo) so Logo and this are the only two visible children
 *  below md — the pill's own `justify-between` spreads them to opposite
 *  ends, same mechanism components/navbar.tsx uses, no explicit position
 *  needed. Padding/typography below is copied from that file's mobile
 *  dropdown: px-5 py-3 per item, text-sm font-medium uppercase tracking-wide,
 *  font-heading at weight 475 — that 475 (not the text-sm default weight,
 *  and not Tailwind's font-medium=500) is what navbar.tsx actually ships,
 *  so it's reproduced exactly rather than rounded to a named Tailwind
 *  weight. */
export function AdminNavMobile({ pendingSubmissions = 0 }: AdminNavProps) {
  const navItems = useNavItems(pendingSubmissions)
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <>
      <button
        className="md:hidden p-3 -mr-2 rounded-md border-0 bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-slate-200"
        onClick={() => setMenuOpen((open) => !open)}
        aria-label="Toggle menu"
      >
        <div className="w-[21px] h-[16px] flex flex-col justify-between relative">
          <div className={`w-full h-[2px] bg-black rounded-full transition-all duration-200 ${menuOpen ? 'rotate-45 translate-y-[7px]' : ''}`} />
          <div className={`w-full h-[2px] bg-black rounded-full transition-all duration-200 ${menuOpen ? 'opacity-0' : ''}`} />
          <div className={`w-full h-[2px] bg-black rounded-full transition-all duration-200 ${menuOpen ? '-rotate-45 -translate-y-[7px]' : ''}`} />
        </div>
      </button>

      {/* Absolutely positioned against the `relative` wrapper that also
          contains the pill (app/admin/layout.tsx), not `fixed` against the
          viewport — that wrapper has no padding of its own, so `left-0
          right-0` here inherit the pill's exact outer width instead of
          re-deriving it via a separate 4vw guess that could drift from the
          header's actual gutter. top-[58px] = h-[50px] pill + an 8px gap,
          both measured from the wrapper's own top edge (not the header's,
          since the wrapper sits inside the header's py-[15px] already). */}
      {menuOpen && (
        <div className="md:hidden absolute top-[58px] left-0 right-0 z-50 bg-white rounded-[15px] shadow-[0_4px_12px_rgba(0,0,0,0.1)] overflow-hidden">
          <div className="py-2">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                style={{ fontWeight: 475, fontFamily: 'var(--font-outfit)' }}
                className="flex items-center justify-between px-5 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50 uppercase tracking-wide transition-colors"
              >
                {item.label}
                {item.badge != null && item.badge > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full bg-primary text-primary-foreground leading-none normal-case tracking-normal">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
              </Link>
            ))}
            <Link
              href="/"
              target="_blank"
              onClick={() => setMenuOpen(false)}
              style={{ fontWeight: 475, fontFamily: 'var(--font-outfit)' }}
              className="flex items-center gap-1 px-5 py-3 text-sm font-medium text-slate-500 hover:bg-slate-50 uppercase tracking-wide transition-colors"
            >
              View Site
              <ArrowUpRight className="size-3.5" />
            </Link>
            {/* Sign out deliberately excluded from the uppercase/font-heading-475
                treatment above — it isn't one of the public site's nav items
                and stays visually distinct from the main group, as before. */}
            <form action="/api/auth/signout" method="POST" className="border-t border-slate-100 mt-1 pt-1">
              <button
                type="submit"
                className="block w-full text-left px-5 py-3 text-sm font-medium text-slate-500 hover:bg-slate-50 transition-colors"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
