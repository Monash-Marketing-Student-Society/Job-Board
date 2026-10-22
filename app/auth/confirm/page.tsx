import Link from 'next/link'
import { Button } from '@/components/ui'
import { AuthBackdrop } from '@/components/admin/auth-backdrop'
import { parseAdminAuthLinkType } from '@/lib/admin-auth-links'

/**
 * /auth/confirm — where admin invite and password-reset emails land.
 *
 * The token is not used on arrival. Mail scanners (Outlook's Safe Links among
 * them) open every link in an email before the person does, and a one-time
 * token spent by a scanner leaves the real recipient holding a dead link. So
 * this page only shows a button, and the token is verified by the POST that
 * button sends, which a scanner does not make.
 */
export default async function AuthConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string }>
}) {
  const { token_hash: tokenHash, type: rawType } = await searchParams
  const type = parseAdminAuthLinkType(rawType)
  const valid = Boolean(tokenHash && type)

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <AuthBackdrop />
      <div className="w-full max-w-md relative z-10">
        <div className="auth-card">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold">
              {type === 'invite' ? 'Set Up Your Admin Account' : 'Reset Password'}
            </h1>
            <p className="text-muted-foreground mt-1">
              {valid
                ? 'Continue to choose your password.'
                : 'This link is incomplete. Please use the button in the email, or ask an admin for a new one.'}
            </p>
          </div>

          {valid ? (
            <form action="/api/auth/confirm" method="post">
              <input type="hidden" name="token_hash" value={tokenHash} />
              <input type="hidden" name="type" value={type ?? ''} />
              <Button type="submit" variant="primary" className="w-full">
                Continue
              </Button>
            </form>
          ) : (
            <Link href="/admin/login">
              <Button variant="primary" className="w-full">Back to Login</Button>
            </Link>
          )}
        </div>
      </div>
    </main>
  )
}
