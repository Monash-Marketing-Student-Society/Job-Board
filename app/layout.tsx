import type { Metadata } from 'next'
import { Public_Sans, Outfit } from 'next/font/google'
import { Navbar } from '@/components/navbar'
import { SiteMain } from '@/components/site-main'
import { Footer } from '@/components/footer'
import { SmoothScroll } from '@/components/smooth-scroll'
import { BottomBlur } from '@/components/bottom-blur'
import './globals.css'
import { Toaster } from 'sonner'
import { cn } from "@/lib/utils";

// Single app font. --font-sans and --font-heading both resolve to this —
// defined here on <html>, the same position --font-inter/--font-outfit used
// to occupy, so it's already in scope wherever font-sans/font-heading are
// consumed (custom properties don't flow upward, so it has to be at or above
// the element that reads it) and inherits to every descendant, portals
// included.
const publicSans = Public_Sans({ subsets: ['latin'], variable: '--font-public-sans' })

// Nav-only. --font-outfit is consumed directly via inline
// style={{ fontFamily: 'var(--font-outfit)' }} at the nav link call sites
// (components/navbar.tsx, components/admin/admin-nav.tsx) rather than
// through a font-heading/font-sans token, so reintroducing it here doesn't
// touch the rest of the app — every other font-heading consumer still
// resolves to Public Sans.
const outfit = Outfit({ subsets: ['latin'], variable: '--font-outfit', display: 'swap' })

export const metadata: Metadata = {
  title: 'MMSS Job Board | Monash Marketing Students\' Society',
  description: 'Find marketing internships, graduate roles, and career opportunities curated for Monash marketing students.',
  keywords: ['marketing jobs', 'internships', 'graduate roles', 'Monash', 'MMSS', 'career opportunities'],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={cn("font-sans", publicSans.variable, outfit.variable)}>
      <body>
        <SmoothScroll />
        <Navbar />
        <SiteMain>{children}</SiteMain>
        <Footer />
        <BottomBlur />

        {/* One Toaster for the whole app. It used to be mounted in the admin
            layout, which left the public submit form with nowhere to send a
            toast; mounting it in both would have double-rendered every admin
            toast, since the admin layout nests inside this one.

            Bottom right, and deliberately not richColors. That flag paints
            the whole toast in the status colour -- a solid green panel for
            every success -- which is louder than the work it reports and
            makes an error hard to pick out of a stream of them. Neutral
            surface with the status carried by the icon reads as one system
            and keeps red meaning something. */}
        <Toaster position="bottom-right" closeButton />
      </body>
    </html>
  )
}
