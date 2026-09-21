import { toast } from 'sonner'

/**
 * Every toast the app can raise, and what has to happen for it to appear.
 *
 * Hand-maintained against the `toast.*` call sites, because the thing worth
 * documenting here is not the string — a grep gives you that — but the
 * condition. "Job published to the live board" is one line of code and three
 * facts: an admin pressed Approve, the API returned ok, and the approval
 * email went out. The last of those is what separates it from the warning
 * variant directly below it, and no scan recovers that.
 *
 * `preview` fires the real toast through the real sonner instance, so what
 * you see on this page is what a user sees, not a drawing of it.
 *
 * Keep in sync when a toast is added or reworded. Messages built at runtime
 * from a name or a server error are shown with a representative value and
 * marked `dynamic`.
 */

export type ToastKind = 'success' | 'error' | 'warning'

export interface NotificationSpec {
  id: string
  kind: ToastKind
  /** The message as the user reads it. */
  title: string
  /** Sonner's second line, where the call site passes one. */
  description?: string
  /** Exactly what must happen for this to appear. */
  trigger: string
  /** Where the user is when it fires. */
  route: string
  /** Whether a signed-out visitor can see it. */
  audience: 'public' | 'admin'
  file: string
  /** Message is assembled at runtime; the text here is representative. */
  dynamic?: boolean
  /** Anything non-default about how it behaves. */
  note?: string
}

export const NOTIFICATION_GROUPS: { group: string; blurb: string; items: NotificationSpec[] }[] = [
  {
    group: 'Posting a job',
    blurb: 'The public submission form. The only notifications a non-admin can see.',
    items: [
      {
        id: 'submit-invalid-email',
        kind: 'error',
        title: 'Please enter a valid work email address.',
        trigger:
          'Submit pressed and the work email fails our own check. The field is type="email", so the browser usually catches a malformed address first — this fires for addresses the browser accepts but we do not.',
        route: '/submit',
        audience: 'public',
        file: 'components/jobs/job-submission-form.tsx:183',
      },
      {
        id: 'submit-invalid-url',
        kind: 'error',
        title: 'Application URL must be a valid http(s) link or an email address.',
        trigger:
          'Submit pressed with an Application URL that is neither an http(s) link nor an email address — an ftp:// link, say. The field is plain text, so nothing catches this earlier.',
        route: '/submit',
        audience: 'public',
        file: 'components/jobs/job-submission-form.tsx:189',
      },
      {
        id: 'submit-failed',
        kind: 'error',
        title: 'Something went wrong. Please try again.',
        trigger:
          'The POST to /api/submit-job fails or returns an error. Shows the server message when there is one — a rate-limit rejection, say — and this wording otherwise.',
        route: '/submit · /submit/edit',
        audience: 'public',
        file: 'components/jobs/job-submission-form.tsx:235',
        dynamic: true,
      },
    ],
  },
  {
    group: 'Signing in',
    blurb: 'The admin login and password reset pages, before anyone is signed in.',
    items: [
      {
        id: 'signin-unauthorized',
        kind: 'error',
        title: 'That account does not have admin access.',
        trigger:
          'Redirected back to the login page with ?error=unauthorized — the Google account signed in successfully but is not in admin_users.',
        route: '/admin/login',
        audience: 'public',
        file: 'app/admin/login/page.tsx:103',
        note: 'Carries a fixed id so a reload cannot stack duplicates.',
      },
      {
        id: 'signin-cancelled',
        kind: 'error',
        title: 'Sign-in cancelled.',
        trigger: 'The Google consent screen was dismissed without choosing an account.',
        route: '/admin/login',
        audience: 'public',
        file: 'app/admin/login/page.tsx:103',
      },
      {
        id: 'signin-oauth',
        kind: 'error',
        title: 'Google sign-in did not complete.',
        trigger: 'The OAuth callback returned an error rather than a session.',
        route: '/admin/login',
        audience: 'public',
        file: 'app/admin/login/page.tsx:103',
      },
      {
        id: 'signin-google-start',
        kind: 'error',
        title: 'Could not start Google sign-in',
        trigger:
          'Continue with Google pressed and Supabase refuses before the redirect — the usual cause is the Google consent screen still being set to Internal.',
        route: '/admin/login',
        audience: 'public',
        file: 'app/admin/login/page.tsx:131',
        dynamic: true,
      },
      {
        id: 'signin-password-failed',
        kind: 'error',
        title: 'Sign-in failed.',
        trigger:
          'Email and password submitted and Supabase rejects them. Shows the first sentence of the upstream error when it is short enough.',
        route: '/admin/login',
        audience: 'public',
        file: 'app/admin/login/page.tsx:166',
        dynamic: true,
      },
      {
        id: 'reset-no-email',
        kind: 'error',
        title: 'Enter your email first.',
        trigger: 'Forgot password? pressed with the email field empty.',
        route: '/admin/login',
        audience: 'public',
        file: 'app/admin/login/page.tsx:174',
      },
      {
        id: 'reset-sent',
        kind: 'success',
        title: 'Reset link sent, if that account exists.',
        trigger:
          'Forgot password? pressed with an email filled in and Supabase accepts the request.',
        route: '/admin/login',
        audience: 'public',
        file: 'app/admin/login/page.tsx:184',
        note: 'Deliberately non-committal: confirming whether an address has an account would let anyone test for one.',
      },
      {
        id: 'reset-send-failed',
        kind: 'error',
        title: 'Could not send the reset email.',
        trigger: 'The reset request itself fails — Supabase rate-limits these fairly aggressively.',
        route: '/admin/login',
        audience: 'public',
        file: 'app/admin/login/page.tsx:186',
        dynamic: true,
      },
      {
        id: 'pw-too-short',
        kind: 'error',
        title: 'Password must be at least 6 characters.',
        trigger:
          'The new password is under six characters. Checked by us, not the browser: the native bubble described this as "please lengthen this text" and collided with Chrome’s password manager.',
        route: '/admin/reset-password',
        audience: 'public',
        file: 'app/admin/reset-password/page.tsx:60',
      },
      {
        id: 'pw-mismatch',
        kind: 'error',
        title: 'Passwords do not match.',
        trigger: 'The two password fields differ.',
        route: '/admin/reset-password',
        audience: 'public',
        file: 'app/admin/reset-password/page.tsx:64',
      },
      {
        id: 'pw-updated',
        kind: 'success',
        title: 'Password updated.',
        trigger: 'The new password is accepted. The page then redirects to the dashboard.',
        route: '/admin/reset-password',
        audience: 'public',
        file: 'app/admin/reset-password/page.tsx:75',
      },
      {
        id: 'pw-update-failed',
        kind: 'error',
        title: 'Could not update the password.',
        trigger:
          'Supabase rejects the update — most often because the reset link has expired.',
        route: '/admin/reset-password',
        audience: 'public',
        file: 'app/admin/reset-password/page.tsx:78',
        dynamic: true,
      },
    ],
  },
  {
    group: 'Reviewing submissions',
    blurb: 'The approval queue. These are the only toasts that can reach an employer by email.',
    items: [
      {
        id: 'sub-approved',
        kind: 'success',
        title: 'Job published to the live board',
        trigger:
          'Approve pressed, the job record is created, and the approval email reaches the submitter.',
        route: '/admin/submissions',
        audience: 'admin',
        file: 'components/admin/submissions-table.tsx:217',
      },
      {
        id: 'sub-approved-no-email',
        kind: 'warning',
        title: 'Job published, but the approval email failed to send',
        description: 'The reason Resend gave',
        trigger:
          'Approve succeeded and the job is live, but the email did not go out. The job is published either way — this is the one case where the admin has to follow up by hand.',
        route: '/admin/submissions',
        audience: 'admin',
        file: 'components/admin/submissions-table.tsx:212',
        note: 'Holds for 10 seconds rather than the default, since it asks for an action.',
      },
      {
        id: 'sub-approve-failed',
        kind: 'error',
        title: 'Failed to approve submission',
        trigger:
          'The approve call fails. Nothing is published. Also covers a submission another admin approved first — the claim is atomic.',
        route: '/admin/submissions',
        audience: 'admin',
        file: 'components/admin/submissions-table.tsx:205',
        dynamic: true,
      },
      {
        id: 'sub-rejected',
        kind: 'success',
        title: 'Submission rejected',
        trigger: 'Reject confirmed and the rejection email reaches the submitter.',
        route: '/admin/submissions',
        audience: 'admin',
        file: 'components/admin/submissions-table.tsx:263',
      },
      {
        id: 'sub-rejected-no-email',
        kind: 'warning',
        title: 'Submission rejected, but the notification email failed to send',
        description: 'The reason Resend gave',
        trigger:
          'The rejection was recorded but the submitter was not told. They are still waiting to hear back.',
        route: '/admin/submissions',
        audience: 'admin',
        file: 'components/admin/submissions-table.tsx:258',
        note: 'Also holds for 10 seconds.',
      },
      {
        id: 'sub-reject-failed',
        kind: 'error',
        title: 'Failed to reject submission',
        trigger: 'The reject call fails. The submission stays in the queue.',
        route: '/admin/submissions',
        audience: 'admin',
        file: 'components/admin/submissions-table.tsx:253',
        dynamic: true,
      },
      {
        id: 'sub-archived',
        kind: 'success',
        title: 'Submission archived',
        trigger:
          'A submission is archived out of the queue. Reads "restored to the queue" when the archived view is open and the action is reversed.',
        route: '/admin/submissions',
        audience: 'admin',
        file: 'components/admin/submissions-table.tsx:299',
        dynamic: true,
      },
      {
        id: 'sub-bulk-archived',
        kind: 'success',
        title: '3 submissions archived',
        trigger:
          'Several submissions archived at once. Counts and pluralises, and flips to "restored to the queue" in the archived view.',
        route: '/admin/submissions',
        audience: 'admin',
        file: 'components/admin/submissions-table.tsx:381',
        dynamic: true,
      },
    ],
  },
  {
    group: 'Managing jobs',
    blurb: 'The jobs table and the job form.',
    items: [
      {
        id: 'job-deactivated',
        kind: 'success',
        title: 'Job deactivated',
        trigger: 'A live job is taken off the board. It stays in the table, not on the site.',
        route: '/admin/jobs',
        audience: 'admin',
        file: 'components/admin/job-table.tsx:152',
      },
      {
        id: 'job-activated',
        kind: 'success',
        title: 'Job activated',
        trigger: 'An inactive job is put back on the live board.',
        route: '/admin/jobs',
        audience: 'admin',
        file: 'components/admin/job-table.tsx:172',
      },
      {
        id: 'job-deleted',
        kind: 'success',
        title: 'Job deleted',
        trigger: 'Delete confirmed in the dialog. Unlike deactivating, this does not come back.',
        route: '/admin/jobs',
        audience: 'admin',
        file: 'components/admin/job-table.tsx:198',
      },
      {
        id: 'job-action-failed',
        kind: 'error',
        title: 'Failed to deactivate job',
        description: 'The database error',
        trigger:
          'Any single-job action that the database refuses. The same shape covers activate and delete.',
        route: '/admin/jobs',
        audience: 'admin',
        file: 'components/admin/job-table.tsx:148',
        dynamic: true,
      },
      {
        id: 'job-bulk-days',
        kind: 'error',
        title: 'Please enter a valid number of days',
        trigger: 'The bulk deactivate-older-than prompt is submitted with something that is not a number.',
        route: '/admin/jobs',
        audience: 'admin',
        file: 'components/admin/job-table.tsx:206',
      },
      {
        id: 'job-bulk-done',
        kind: 'success',
        title: 'Old and expired jobs deactivated',
        trigger: 'The bulk cleanup finishes with every job updated.',
        route: '/admin/jobs',
        audience: 'admin',
        file: 'components/admin/job-table.tsx:238',
      },
      {
        id: 'job-bulk-partial',
        kind: 'error',
        title: 'Failed to deactivate some jobs',
        trigger:
          'The cleanup ran but some rows did not update. Deliberately distinct from a total failure: part of the work landed.',
        route: '/admin/jobs',
        audience: 'admin',
        file: 'components/admin/job-table.tsx:231',
        dynamic: true,
      },
      {
        id: 'job-bulk-count',
        kind: 'success',
        title: '4 jobs deactivated',
        trigger: 'Several jobs deactivated by selection. Counts what was actually changed.',
        route: '/admin/jobs',
        audience: 'admin',
        file: 'components/admin/job-table.tsx:266',
        dynamic: true,
      },
      {
        id: 'job-form-url',
        kind: 'error',
        title: 'Application URL must be a valid http(s) link or an email address.',
        trigger:
          'The admin job form is saved with a URL that is neither. Same rule as the public form.',
        route: '/admin/jobs/new · /admin/jobs/[id]/edit',
        audience: 'admin',
        file: 'components/admin/job-form.tsx:82',
      },
      {
        id: 'job-form-save',
        kind: 'error',
        title: 'Failed to save job',
        trigger: 'The insert or update is refused.',
        route: '/admin/jobs/new · /admin/jobs/[id]/edit',
        audience: 'admin',
        file: 'components/admin/job-form.tsx:128',
        dynamic: true,
      },
    ],
  },
  {
    group: 'Bulk import',
    blurb: 'The spreadsheet importer on the jobs page.',
    items: [
      {
        id: 'import-template-failed',
        kind: 'error',
        title: 'Failed to generate the template file.',
        trigger: 'Download template pressed and the .xlsx could not be built.',
        route: '/admin/jobs',
        audience: 'admin',
        file: 'components/admin/bulk-import.tsx:246',
      },
      {
        id: 'import-no-rows',
        kind: 'error',
        title: 'No valid job rows found in the spreadsheet.',
        trigger:
          'The file parsed but every row was rejected — usually the wrong sheet, or the header row edited.',
        route: '/admin/jobs',
        audience: 'admin',
        file: 'components/admin/bulk-import.tsx:264',
      },
      {
        id: 'import-unreadable',
        kind: 'error',
        title: 'Failed to read the file. Make sure it is a valid .xlsx file.',
        trigger: 'The upload could not be parsed at all — a .csv or .numbers renamed to .xlsx.',
        route: '/admin/jobs',
        audience: 'admin',
        file: 'components/admin/bulk-import.tsx:270',
      },
      {
        id: 'import-failed',
        kind: 'error',
        title: 'An unexpected error occurred during import.',
        trigger: 'The import ran and threw. Per-row failures are reported in the panel instead.',
        route: '/admin/jobs',
        audience: 'admin',
        file: 'components/admin/bulk-import.tsx:319',
      },
    ],
  },
  {
    group: 'Admin access',
    blurb: 'Who can sign in to the dashboard.',
    items: [
      {
        id: 'invite-sent',
        kind: 'success',
        title: 'Invitation sent to hr@example.com.',
        trigger: 'An invite is sent to an address with no existing account.',
        route: '/admin/users',
        audience: 'admin',
        file: 'app/admin/users/page.tsx:143',
        dynamic: true,
      },
      {
        id: 'invite-existing',
        kind: 'success',
        title: 'hr@example.com already had an account — admin access granted immediately.',
        trigger:
          'The invited address already exists, so there is nothing to accept — access is live now.',
        route: '/admin/users',
        audience: 'admin',
        file: 'app/admin/users/page.tsx:143',
        dynamic: true,
      },
      {
        id: 'invite-no-email',
        kind: 'success',
        title:
          'hr@example.com can now sign in with Google. The invite email could not be sent, so send them the link yourself.',
        trigger:
          'The account was created but Supabase rate-limited the invite email. Access works; the person just has not been told.',
        route: '/admin/users',
        audience: 'admin',
        file: 'app/admin/users/page.tsx:143',
        dynamic: true,
      },
      {
        id: 'invite-failed',
        kind: 'error',
        title: 'Failed to send the invitation',
        trigger: 'The invite call fails outright.',
        route: '/admin/users',
        audience: 'admin',
        file: 'app/admin/users/page.tsx:147',
        dynamic: true,
      },
      {
        id: 'invite-withdrawn',
        kind: 'success',
        title: 'Invitation to hr@example.com withdrawn.',
        trigger: 'A pending invitation is cancelled before it is accepted.',
        route: '/admin/users',
        audience: 'admin',
        file: 'app/admin/users/page.tsx:223',
        dynamic: true,
      },
      {
        id: 'admin-removed',
        kind: 'success',
        title: 'hr@example.com no longer has admin access.',
        trigger: 'An admin is removed and the removal sticks.',
        route: '/admin/users',
        audience: 'admin',
        file: 'app/admin/users/page.tsx:200',
        dynamic: true,
      },
      {
        id: 'admin-removed-regrant',
        kind: 'success',
        title: 'hr@example.com was removed',
        description:
          'Their domain is auto-approved, so they will be granted access again on their next sign-in.',
        trigger:
          'An admin is removed whose email domain is in ADMIN_AUTO_APPROVE_DOMAINS. The removal happened, and it will not hold.',
        route: '/admin/users',
        audience: 'admin',
        file: 'app/admin/users/page.tsx:195',
        dynamic: true,
      },
      {
        id: 'admin-remove-failed',
        kind: 'error',
        title: 'Failed to remove admin',
        trigger:
          'The removal is refused — including the guard that stops the last admin removing themselves.',
        route: '/admin/users',
        audience: 'admin',
        file: 'app/admin/users/page.tsx:187',
        dynamic: true,
      },
      {
        id: 'admin-reset-sent',
        kind: 'success',
        title: 'Password reset link sent to hr@example.com.',
        trigger: 'An admin sends another admin a reset link from the roster.',
        route: '/admin/users',
        audience: 'admin',
        file: 'app/admin/users/page.tsx:159',
        dynamic: true,
      },
      {
        id: 'admin-reset-failed',
        kind: 'error',
        title: 'Failed to send the reset email',
        trigger: 'That reset request fails, usually on Supabase rate limits.',
        route: '/admin/users',
        audience: 'admin',
        file: 'app/admin/users/page.tsx:161',
        dynamic: true,
      },
      {
        id: 'recovery-saved',
        kind: 'success',
        title: 'hr@example.com is now the recovery admin.',
        trigger:
          'The recovery admin is set — the account that can always get back in if everyone else is locked out.',
        route: '/admin/users',
        audience: 'admin',
        file: 'app/admin/users/page.tsx:111',
        dynamic: true,
      },
      {
        id: 'recovery-failed',
        kind: 'error',
        title: 'Failed to save the recovery admin',
        trigger: 'That change is refused.',
        route: '/admin/users',
        audience: 'admin',
        file: 'app/admin/users/page.tsx:114',
        dynamic: true,
      },
    ],
  },
]

/** Fires the real toast, so the page shows the thing itself. */
export function preview(spec: NotificationSpec) {
  const options = spec.description ? { description: spec.description } : undefined
  if (spec.kind === 'success') toast.success(spec.title, options)
  else if (spec.kind === 'warning') toast.warning(spec.title, { ...options, duration: 10000 })
  else toast.error(spec.title, options)
}

export const TOTAL = NOTIFICATION_GROUPS.reduce((n, g) => n + g.items.length, 0)
