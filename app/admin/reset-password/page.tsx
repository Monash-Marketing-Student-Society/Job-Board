'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button, Input } from '@/components/ui'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { AuthBackdrop } from '@/components/admin/auth-backdrop'

export default function ResetPasswordPage() {
  const router = useRouter()

  const [status, setStatus] = useState<'checking' | 'ready' | 'invalid'>('checking')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [accountEmail, setAccountEmail] = useState('')
  const [isInvite, setIsInvite] = useState(false)

  useEffect(() => {
    // Every way here is a server redirect that has just signed the browser in
    // as the account the email was sent to, and says so with ?link=:
    // /api/auth/confirm for invite and admin-sent reset emails, /auth/callback
    // for "Forgot password?". Without that marker the page does not offer a
    // reset at all. It used to accept any existing session, and that is how an
    // invite for a student address ended up offering to set the password of
    // mmss@monashclubs.org, the account the browser happened to be signed in to.
    const link = new URLSearchParams(window.location.search).get('link')
    setIsInvite(link === 'invite')

    if (link !== 'invite' && link !== 'recovery') {
      setStatus('invalid')
      return
    }

    createClient()
      .auth.getSession()
      .then(({ data: { session } }) => {
        const email = session?.user?.email
        if (!email) {
          setStatus('invalid')
          return
        }
        // Which account this is. A committee often has several mailboxes in
        // play at once -- a personal address, the club's, the partnerships
        // one -- so the page names it rather than leaving it to be guessed.
        setAccountEmail(email)
        setStatus('ready')
      })
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters.')
      return
    }
    if (password !== confirmPassword) {
      toast.error('Passwords do not match.')
      return
    }

    setIsSubmitting(true)
    try {
      const supabase = createClient()
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError

      setSuccess(true)
      toast.success('Password updated.')
      setTimeout(() => router.push('/admin/login'), 2000)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update the password.')
    } finally {
      setIsSubmitting(false)
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
            <h1 className="text-2xl font-bold">{isInvite ? 'Set Your Password' : 'Reset Password'}</h1>
            <p className="text-muted-foreground mt-1">
              {isInvite
                ? 'Choose a password for your new admin account'
                : 'Choose a new password for your admin account'}
            </p>
            {accountEmail && (
              <p className="mt-3 text-sm">
                <span className="text-muted-foreground">for </span>
                <span className="font-semibold text-foreground break-all">{accountEmail}</span>
              </p>
            )}
          </div>

          {status === 'checking' && (
            <p className="text-center text-sm text-muted-foreground py-4">
              Verifying reset link&hellip;
            </p>
          )}

          {status === 'invalid' && (
            <>
              <p className="text-sm text-muted-foreground text-center mb-6">
                This link is invalid, has expired or has already been used. Please request a new one.
              </p>
              <Link href="/admin/login">
                <Button variant="primary" className="w-full">Back to Login</Button>
              </Link>
            </>
          )}

          {status === 'ready' && !success && (
            <>

              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                <div>
                  <label htmlFor="password" className="block text-sm font-medium mb-1.5">
                    New Password
                  </label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 6 characters"
                    required
                    autoComplete="new-password"
                  />
                </div>

                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium mb-1.5">
                    Confirm New Password
                  </label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your new password"
                    required
                    autoComplete="new-password"
                  />
                </div>

                <Button type="submit" variant="primary" className="w-full" loading={isSubmitting}>
                  Set New Password
                </Button>
              </form>
            </>
          )}

          {success && (
            <p className="text-sm text-muted-foreground text-center">
              Password updated. Redirecting you to sign in&hellip;
            </p>
          )}
        </div>

        <p className="text-center text-sm text-muted-foreground mt-4">
          <Link href="/" className="hover:text-foreground">
            &larr; Back to Job Board
          </Link>
        </p>
      </div>
    </main>
  )
}
