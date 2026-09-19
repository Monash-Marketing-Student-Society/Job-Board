'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button, Input, Alert, AlertDescription } from '@/components/ui'
import { createClient } from '@/lib/supabase/client'

export default function ResetPasswordPage() {
  const router = useRouter()

  const [status, setStatus] = useState<'checking' | 'ready' | 'invalid'>('checking')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    const supabase = createClient()

    // supabase-js parses the #access_token=...&type=recovery fragment on load
    // and fires PASSWORD_RECOVERY once the recovery session is established.
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setStatus('ready')
      }
    })

    // Fallback: if a session already exists by the time this runs (e.g. the
    // auth event fired before the listener was attached), allow reset too.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setStatus((s) => (s === 'checking' ? 'ready' : s))
      else setTimeout(() => setStatus((s) => (s === 'checking' ? 'invalid' : s)), 2000)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setIsSubmitting(true)
    try {
      const supabase = createClient()
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError

      setSuccess(true)
      setTimeout(() => router.push('/admin/login'), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset password')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="bg-card rounded-lg border border-border shadow-sm p-8">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold">Reset Password</h1>
            <p className="text-muted-foreground mt-1">
              Choose a new password for your admin account
            </p>
          </div>

          {status === 'checking' && (
            <p className="text-center text-sm text-muted-foreground py-4">
              Verifying reset link&hellip;
            </p>
          )}

          {status === 'invalid' && (
            <>
              <Alert variant="destructive" className="mb-6">
                <AlertDescription>
                  This password reset link is invalid or has expired. Please request a new one.
                </AlertDescription>
              </Alert>
              <Link href="/admin/login">
                <Button variant="primary" className="w-full">Back to Login</Button>
              </Link>
            </>
          )}

          {status === 'ready' && !success && (
            <>
              {error && (
                <Alert variant="destructive" className="mb-6">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
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
                    minLength={6}
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
                    minLength={6}
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
            <Alert variant="success">
              <AlertDescription>
                Password updated. Redirecting you to sign in&hellip;
              </AlertDescription>
            </Alert>
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
