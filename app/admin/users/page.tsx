'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Button,
  Input,
  Label,
  Alert,
  AlertDescription,
  Badge,
  useConfirmDialog,
} from '@/components/ui'

interface AdminAccountRow {
  id: string
  email: string | null
  createdAt: string
  providers: string[]
  lastSignInAt: string | null
  emailConfirmed: boolean
  viaDomain: boolean
}

interface AdminInviteRow {
  id: string
  email: string
  createdAt: string
  claimedAt: string | null
}

interface RosterResponse {
  admins: AdminAccountRow[]
  invites: AdminInviteRow[]
  autoApproveDomains: string[]
}

const PROVIDER_LABELS: Record<string, string> = {
  google: 'Google',
  email: 'Password',
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('en-AU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

/**
 * Last sign-in carries more meaning close up — "3 hours ago" tells you someone
 * is actively using the account, where a date does not — so recent times are
 * relative and anything older falls back to the date.
 */
function formatLastSignIn(value: string | null): string {
  if (!value) return 'Never'
  const then = new Date(value).getTime()
  const minutes = Math.floor((Date.now() - then) / 60000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`
  return formatDate(value)
}

export default function AdminUsersPage() {
  const [roster, setRoster] = useState<RosterResponse>({
    admins: [],
    invites: [],
    autoApproveDomains: [],
  })
  const [isLoading, setIsLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [isInviting, setIsInviting] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const { confirm, dialog } = useConfirmDialog()

  const fetchRoster = useCallback(async () => {
    setIsLoading(true)
    const res = await fetch('/api/admin/users')
    if (res.ok) {
      const { data } = await res.json()
      setRoster(data)
    }
    setIsLoading(false)
  }, [])

  useEffect(() => {
    fetchRoster()
  }, [fetchRoster])

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsInviting(true)
    setMessage(null)

    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Failed to send the invitation')

      // The grant and the email are separate outcomes — see the POST handler.
      // An invitation that was recorded but not emailed is still usable via
      // Google, and saying so avoids a pointless second attempt.
      const text =
        body.outcome === 'granted'
          ? `${body.email} already had an account — admin access granted immediately.`
          : body.outcome === 'invited-no-email'
            ? `${body.email} can now sign in with Google. The invite email could not be sent (Supabase rate-limits these), so send them the link yourself if they need a password.`
            : `Invitation sent to ${body.email}.`

      setMessage({ type: 'success', text })
      setEmail('')
      fetchRoster()
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to send the invitation',
      })
    } finally {
      setIsInviting(false)
    }
  }

  const handleSendReset = async (admin: AdminAccountRow) => {
    setBusyId(admin.id)
    setMessage(null)
    try {
      const res = await fetch(`/api/admin/users/${admin.id}/reset-password`, { method: 'POST' })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Failed to send the reset email')
      setMessage({ type: 'success', text: `Password reset link sent to ${body.email}.` })
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to send the reset email',
      })
    } finally {
      setBusyId(null)
    }
  }

  const handleRemoveAdmin = async (admin: AdminAccountRow) => {
    const label = admin.email ?? 'this admin'
    const { confirmed } = await confirm({
      title: `Remove ${label}?`,
      description:
        'They lose access to the dashboard immediately. Their sign-in account is kept, so inviting them again restores access without a new one.',
      warning: admin.viaDomain
        ? `${label} is on an auto-approved domain, so they will regain admin access the next time they sign in. Remove the domain from ADMIN_AUTO_APPROVE_DOMAINS to make this stick.`
        : undefined,
      confirmLabel: 'Remove access',
      destructive: true,
    })
    if (!confirmed) return

    setBusyId(admin.id)
    const res = await fetch(`/api/admin/users/${admin.id}`, { method: 'DELETE' })
    const body = await res.json().catch(() => ({}))
    setBusyId(null)

    if (!res.ok) {
      setMessage({ type: 'error', text: body.error || 'Failed to remove admin' })
      return
    }

    setMessage({
      type: 'success',
      text: body.reGrantedByDomain
        ? `${label} was removed, but their domain is auto-approved — they will be granted access again on their next sign-in.`
        : `${label} no longer has admin access.`,
    })
    fetchRoster()
  }

  const handleWithdrawInvite = async (invite: AdminInviteRow) => {
    const { confirmed } = await confirm({
      title: `Withdraw the invitation to ${invite.email}?`,
      description: 'Any link already emailed to them will stop granting admin access.',
      confirmLabel: 'Withdraw',
      destructive: true,
    })
    if (!confirmed) return

    setBusyId(invite.id)
    const res = await fetch(`/api/admin/invites/${invite.id}`, { method: 'DELETE' })
    const body = await res.json().catch(() => ({}))
    setBusyId(null)

    if (!res.ok) {
      setMessage({ type: 'error', text: body.error || 'Failed to withdraw the invitation' })
      return
    }
    setMessage({ type: 'success', text: `Invitation to ${invite.email} withdrawn.` })
    fetchRoster()
  }

  return (
    <div>
      {dialog}

      <div className="mb-6">
        <h1 className="text-[22px] font-bold text-slate-800 font-heading">Admin Users</h1>
        <p className="text-sm text-slate-500 mt-1">
          Manage who can sign in to the dashboard, and how.
        </p>
      </div>

      {message && (
        <Alert
          variant={message.type === 'success' ? 'success' : 'destructive'}
          className="mb-6 max-w-3xl"
        >
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}

      {/* Invite */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-6 max-w-xl">
        <h2 className="text-base font-semibold text-slate-700 font-heading">Invite an admin</h2>
        <p className="text-sm text-slate-500 mt-1 mb-4">
          They&apos;ll be able to sign in with Google straight away, and will also get an email
          link if they&apos;d rather set a password.
        </p>

        <form onSubmit={handleInvite} className="flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="flex-1">
            <Label htmlFor="email" required>
              Email
            </Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@monashmss.com"
              required
              className="mt-1.5"
            />
          </div>
          <Button type="submit" variant="primary" loading={isInviting} className="sm:mb-0">
            Send invite
          </Button>
        </form>

        {roster.autoApproveDomains.length > 0 && (
          <p className="text-xs text-slate-500 mt-4 pt-4 border-t border-slate-100">
            Anyone with an address on{' '}
            <span className="font-medium text-slate-700">
              {roster.autoApproveDomains.map((domain) => `@${domain}`).join(', ')}
            </span>{' '}
            is granted admin access automatically on their first Google sign-in — no invitation
            needed.
          </p>
        )}
      </div>

      {/* Current admins */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-6">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-700 font-heading">
            Admins{!isLoading && ` (${roster.admins.length})`}
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-left px-5 py-3 text-[11px] uppercase tracking-wide text-slate-500 font-medium">
                  Email
                </th>
                <th className="text-left px-5 py-3 text-[11px] uppercase tracking-wide text-slate-500 font-medium">
                  Sign-in method
                </th>
                <th className="text-left px-5 py-3 text-[11px] uppercase tracking-wide text-slate-500 font-medium">
                  Last sign-in
                </th>
                <th className="text-left px-5 py-3 text-[11px] uppercase tracking-wide text-slate-500 font-medium">
                  Added
                </th>
                <th className="text-right px-5 py-3 text-[11px] uppercase tracking-wide text-slate-500 font-medium">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-slate-400 text-sm">
                    Loading...
                  </td>
                </tr>
              ) : roster.admins.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-slate-400 text-sm">
                    No admin users found
                  </td>
                </tr>
              ) : (
                roster.admins.map((admin) => (
                  <tr key={admin.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-5 py-4 text-slate-700">
                      {admin.email || (
                        <span className="font-mono text-xs text-slate-400">{admin.id}</span>
                      )}
                      {admin.email && !admin.emailConfirmed && (
                        <Badge variant="warning" className="ml-2">
                          Unconfirmed
                        </Badge>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-1.5">
                        {admin.providers.length === 0 ? (
                          <span className="text-xs text-slate-400">—</span>
                        ) : (
                          admin.providers.map((provider) => (
                            <Badge
                              key={provider}
                              variant={provider === 'google' ? 'secondary' : 'outline'}
                            >
                              {PROVIDER_LABELS[provider] ?? provider}
                            </Badge>
                          ))
                        )}
                        {admin.viaDomain && (
                          <Badge variant="outline" title="Granted by an auto-approved domain">
                            Domain
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-xs text-slate-500">
                      {formatLastSignIn(admin.lastSignInAt)}
                    </td>
                    <td className="px-5 py-4 text-xs text-slate-400">
                      {formatDate(admin.createdAt)}
                    </td>
                    <td className="px-5 py-4 text-right whitespace-nowrap">
                      <button
                        onClick={() => handleSendReset(admin)}
                        disabled={busyId === admin.id || !admin.email}
                        className="text-xs text-slate-500 hover:text-slate-800 hover:underline disabled:opacity-50"
                      >
                        Send reset link
                      </button>
                      <span className="mx-2 text-slate-200">|</span>
                      <button
                        onClick={() => handleRemoveAdmin(admin)}
                        disabled={busyId === admin.id}
                        className="text-xs text-destructive hover:underline disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Outstanding invitations. Hidden entirely when there are none — an
          empty table here is noise, not information. */}
      {roster.invites.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-700 font-heading">
              Pending invitations ({roster.invites.length})
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Invited, but they haven&apos;t signed in yet.
            </p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-left px-5 py-3 text-[11px] uppercase tracking-wide text-slate-500 font-medium">
                  Email
                </th>
                <th className="text-left px-5 py-3 text-[11px] uppercase tracking-wide text-slate-500 font-medium">
                  Invited
                </th>
                <th className="text-right px-5 py-3 text-[11px] uppercase tracking-wide text-slate-500 font-medium">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {roster.invites.map((invite) => (
                <tr key={invite.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-5 py-4 text-slate-700">{invite.email}</td>
                  <td className="px-5 py-4 text-xs text-slate-400">
                    {formatDate(invite.createdAt)}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <button
                      onClick={() => handleWithdrawInvite(invite)}
                      disabled={busyId === invite.id}
                      className="text-xs text-destructive hover:underline disabled:opacity-50"
                    >
                      Withdraw
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
