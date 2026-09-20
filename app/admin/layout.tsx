import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Toaster } from 'sonner'
import { getUser, isCurrentUserAdmin } from '@/lib/supabase/server'
import { getPendingSubmissionCount } from '@/lib/admin-data'
import { AdminNavDesktop, AdminNavMobile } from '@/components/admin/admin-nav'
import { Logo } from '@/components/Logo'
import { TooltipProvider } from '@/components/shadcn/tooltip'

export const metadata = {
  title: 'Admin | MMSS Job Board',
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getUser()

  let pendingSubmissions = 0

  if (user) {
    // Independent of each other — the admin check reuses the request-cached
    // user, so run it alongside the count rather than waiting on it first.
    const [isAdmin, count] = await Promise.all([
      isCurrentUserAdmin(),
      getPendingSubmissionCount(),
    ])

    if (!isAdmin) {
      redirect('/admin/login?error=unauthorized')
    }

    pendingSubmissions = count
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#e8e8e8]">
      {user && (
        <header className="sticky top-0 z-50 px-[4vw] py-[15px]">
          {/* relative: the mobile dropdown (rendered from AdminNavMobile,
              nested inside the pill below) is absolutely positioned against
              this wrapper rather than the viewport, so it inherits the
              pill's actual width instead of re-deriving its own 4vw inset —
              see components/admin/admin-nav.tsx. */}
          <div className="relative">
            <div className="bg-white rounded-[15px] px-3 sm:px-[15px] flex items-center justify-between h-[50px] backdrop-blur-[10px]">
              {/* Logo, nav, and the mobile toggle are direct pill children
                  now — same structure components/navbar.tsx uses. No email/
                  sign-out cluster on desktop any more (sign-out is still in
                  AdminNavMobile's dropdown below md): matching the home
                  nav's placement exactly means matching that it has nothing
                  else on the right, just the nav flush against the edge. */}
              <Link href="/admin/jobs" className="flex items-center shrink-0">
                <Logo variant="admin" />
              </Link>
              <AdminNavDesktop pendingSubmissions={pendingSubmissions} />
              <AdminNavMobile pendingSubmissions={pendingSubmissions} />
            </div>
          </div>
        </header>
      )}

      {/* Scoped to admin rather than the root app layout — tooltips (the
          submission row's Approve/Reject buttons) are an admin-only need
          so far, not a public-site one. */}
      <TooltipProvider delayDuration={200}>
        <main className="flex-1 px-4 sm:px-[15px] py-6 w-full max-w-[1200px] mx-auto">
          {children}
        </main>
      </TooltipProvider>

      {/* Bottom right, and deliberately not richColors. That flag paints the
          whole toast in the status colour -- a solid green panel for every
          success -- which is louder than the work it reports and makes an
          error hard to pick out of a stream of them. Neutral surface with the
          status carried by the icon reads as one system and keeps red meaning
          something. */}
      <Toaster position="bottom-right" closeButton />
    </div>
  )
}
