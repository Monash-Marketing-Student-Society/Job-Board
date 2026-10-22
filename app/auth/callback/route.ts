import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ensureAdminAccess, safeAdminRedirectPath } from '@/lib/admin-access'

/**
 * GET /auth/callback
 *
 * Where Google returns the user after they approve the sign-in. Supabase hands
 * back a one-time `code` in the query string (the PKCE flow), which is
 * exchanged here, server-side, for a session written to cookies — so the
 * session exists before the first admin page renders and middleware sees it on
 * that same navigation.
 *
 * This route is also the gate. Authenticating with Google proves who someone
 * is, not that they are on the committee, so the grant is reconciled here and
 * a user without one is signed straight back out. Leaving them holding a valid
 * session with no admin row would let them sit on /admin/login in a logged-in
 * state that no page acts on, which reads as a broken login.
 */

function baseUrl(request: Request): string {
  // Behind Vercel's proxy the request URL's own origin can be the internal
  // host, which would produce a redirect to a URL the browser cannot resolve.
  const configured = process.env.NEXT_PUBLIC_APP_URL
  if (configured) return configured.replace(/\/$/, '')
  return new URL(request.url).origin
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const origin = baseUrl(request)
  const next = safeAdminRedirectPath(url.searchParams.get('next'))

  // Google can return with a denial rather than a code — the user closing the
  // consent screen is the common one, and it is not an error worth a stack
  // trace, just a trip back to the login page.
  const providerError = url.searchParams.get('error')
  if (providerError) {
    const denied = providerError === 'access_denied'
    return NextResponse.redirect(
      `${origin}/admin/login?error=${denied ? 'cancelled' : 'oauth'}`
    )
  }

  const code = url.searchParams.get('code')
  if (!code) {
    return NextResponse.redirect(`${origin}/admin/login?error=oauth`)
  }

  const supabase = await createServerClient()
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
  if (exchangeError) {
    return NextResponse.redirect(`${origin}/admin/login?error=oauth`)
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(`${origin}/admin/login?error=oauth`)
  }

  const access = await ensureAdminAccess(createAdminClient(), user)

  if (!access.granted) {
    await supabase.auth.signOut()
    return NextResponse.redirect(`${origin}/admin/login?error=unauthorized`)
  }

  return NextResponse.redirect(`${origin}${next}`)
}
