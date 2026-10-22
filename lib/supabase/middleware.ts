import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { CookieOptions } from '@supabase/ssr'

import { VISITOR_COOKIE, VISITOR_COOKIE_MAX_AGE } from '@/lib/analytics/constants'

type CookieToSet = { name: string; value: string; options: CookieOptions }

/**
 * Updates the Supabase session in middleware.
 * This ensures auth tokens are refreshed and cookies are updated.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Do not run code between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Routes reachable without admin access: the login page itself, and the
  // password-reset page, which a newly invited admin reaches signed in but
  // before anything else, and which shows its own "invalid link" message
  // when nobody is signed in.
  const isPublicAdminRoute =
    request.nextUrl.pathname.startsWith('/admin/login') ||
    request.nextUrl.pathname.startsWith('/admin/reset-password')

  // Protect admin routes - redirect to login if not authenticated
  if (request.nextUrl.pathname.startsWith('/admin') && !isPublicAdminRoute) {
    if (!user) {
      const url = request.nextUrl.clone()
      url.pathname = '/admin/login'
      url.searchParams.set('redirect', request.nextUrl.pathname)
      return NextResponse.redirect(url)
    }

    // Check if user is admin
    const { data: adminUser } = await supabase
      .from('admin_users')
      .select('is_admin')
      .eq('id', user.id)
      .single() as { data: { is_admin: boolean } | null }

    if (!adminUser?.is_admin) {
      const url = request.nextUrl.clone()
      url.pathname = '/admin/login'
      url.searchParams.set('error', 'unauthorized')
      return NextResponse.redirect(url)
    }
  }

  // Issue the anonymous visitor id if this browser doesn't have one yet.
  //
  // Deliberately below the admin gate: the redirect responses above return
  // early, so a visitor id is never minted on a request that isn't actually
  // being served a page. The cookie lands on the browser with this response,
  // which means the first /api/track call — fired after the page has loaded —
  // already has it.
  if (!request.cookies.get(VISITOR_COOKIE)) {
    supabaseResponse.cookies.set(VISITOR_COOKIE, crypto.randomUUID(), {
      maxAge: VISITOR_COOKIE_MAX_AGE,
      sameSite: 'lax',
      path: '/',
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
    })
  }

  return supabaseResponse
}
