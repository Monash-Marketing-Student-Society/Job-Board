'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button, Input } from '@/components/ui'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { gmailComposeHref } from '@/lib/utils'
import { AuthBackdrop } from '@/components/admin/auth-backdrop'

/** Google's mark, drawn inline so the button renders without a network fetch. */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  )
}

/**
 * Kept to one short line each.
 *
 * This box sits directly above the form, so every extra line pushes the thing
 * the reader came to use further down the card. A sign-in error has one job:
 * say what went wrong. The remedy belongs wherever the remedy actually is.
 */
const ERROR_MESSAGES: Record<string, string> = {
  unauthorized: 'That account does not have admin access.',
  cancelled: 'Sign-in cancelled.',
  oauth: 'Google sign-in did not complete.',
}

/**
 * Supabase and Google errors are written for developers and run long. Take the
 * first sentence and fall back to our own wording past a sane length, so an
 * upstream change cannot silently turn this box into a paragraph.
 */
function shortMessage(err: unknown, fallback: string): string {
  if (!(err instanceof Error) || !err.message) return fallback
  const firstSentence = err.message.split(/(?<=[.!?])\s/)[0].trim()
  return firstSentence.length > 0 && firstSentence.length <= 80 ? firstSentence : fallback
}

export default function AdminLoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirect') || '/admin/jobs'
  const errorParam = searchParams.get('error')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const [isSendingReset, setIsSendingReset] = useState(false)
  const [recoveryEmail, setRecoveryEmail] = useState('')

  // Fetched rather than hard-coded: the committee can repoint it from
  // /admin/users, and a locked-out person reading a stale address here would
  // be writing to a mailbox nobody checks. Silent on failure -- it is a
  // pointer, and a broken pointer should not become an error box on a page
  // somebody is already struggling with.
  useEffect(() => {
    let active = true
    fetch('/api/auth/recovery-contact')
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (active && body?.email) setRecoveryEmail(body.email)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  /**
   * Take the error out of the URL once it has been read into state.
   *
   * Without this the message is part of the address: it survives a refresh,
   * comes back on a browser Back, and would still be sitting there after a
   * successful sign-in and sign-out. The message should describe the attempt
   * just made, not the one made ten minutes ago.
   */
  useEffect(() => {
    if (!errorParam) return
    // A fixed id so React's double-invoked effects in development, and any
    // re-render of this page, cannot stack the same message twice.
    toast.error(ERROR_MESSAGES[errorParam] ?? 'Sign-in failed.', { id: 'sign-in-error' })
    const params = new URLSearchParams(searchParams.toString())
    params.delete('error')
    const query = params.toString()
    router.replace(query ? `/admin/login?${query}` : '/admin/login', { scroll: false })
  }, [errorParam, searchParams, router])

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true)

    try {
      const supabase = createClient()
      // The redirect lands on /auth/callback, which exchanges the code for a
      // session *and* decides whether this person holds admin access — see
      // app/auth/callback/route.ts. `prompt: select_account` matters on a
      // shared committee machine: without it Google silently reuses whichever
      // account signed in last.
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectTo)}`,
          queryParams: { prompt: 'select_account' },
        },
      })

      if (oauthError) throw oauthError
      // On success the browser navigates to Google; nothing below runs.
    } catch (err) {
      toast.error(shortMessage(err, 'Could not start Google sign-in'))
      setIsGoogleLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      const supabase = createClient()

      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (authError) {
        throw authError
      }

      // Admin access is granted against the email address, and turning that
      // into an admin_users row needs the service-role client. So the check
      // that used to read admin_users from the browser is now a server call
      // that reconciles the grant as well as reporting it.
      const claim = await fetch('/api/auth/claim', { method: 'POST' })

      if (!claim.ok) {
        await supabase.auth.signOut()
        throw new Error(ERROR_MESSAGES.unauthorized)
      }

      router.push(redirectTo)
      router.refresh()
    } catch (err) {
      toast.error(shortMessage(err, 'Sign-in failed.'))
    } finally {
      setIsLoading(false)
    }
  }

  const handleForgotPassword = async () => {
    if (!email) {
      toast.error('Enter your email first.')
      return
    }
    setIsSendingReset(true)
    try {
      const supabase = createClient()
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/admin/reset-password`,
      })
      if (resetError) throw resetError
      toast.success('Reset link sent, if that account exists.')
    } catch (err) {
      toast.error(shortMessage(err, 'Could not send the reset email.'))
    } finally {
      setIsSendingReset(false)
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <AuthBackdrop />
      {/* relative + z-10: the backdrop is fixed at z-0, which paints above the
          admin shell's background but has to stay below the card. */}
      <div className="w-full max-w-md relative z-10">
        <div className="auth-card">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold">Admin Login</h1>
            <p className="text-muted-foreground mt-1">
              Sign in to access the admin dashboard
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={handleGoogleSignIn}
            loading={isGoogleLoading}
          >
            {!isGoogleLoading && (
              <span className="mr-2.5 inline-flex items-center">
                <GoogleMark />
              </span>
            )}
            Continue with Google
          </Button>

          <div className="flex items-center gap-3 my-6">
            <span className="h-px flex-1 bg-border" />
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              or use a password
            </span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-1.5">
                Email
              </label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@example.com"
                required
                autoComplete="email"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium mb-1.5">
                Password
              </label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                autoComplete="current-password"
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              className="w-full"
              loading={isLoading}
            >
              Sign In
            </Button>
          </form>

          <p className="text-center text-sm mt-4">
            <button
              type="button"
              onClick={handleForgotPassword}
              disabled={isSendingReset}
              className="text-muted-foreground hover:text-foreground underline disabled:opacity-50"
            >
              {isSendingReset ? 'Sending…' : 'Forgot password?'}
            </button>
          </p>
        </div>

        {recoveryEmail && (
          <p className="text-center text-xs text-muted-foreground mt-4">
            Locked out?{' '}
            <a
              href={gmailComposeHref(recoveryEmail)}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              Contact {recoveryEmail}
            </a>
          </p>
        )}

        <p className="text-center text-sm text-muted-foreground mt-3">
          <Link href="/" className="hover:text-foreground">
            &larr; Back to Job Board
          </Link>
        </p>
      </div>
    </main>
  )
}
