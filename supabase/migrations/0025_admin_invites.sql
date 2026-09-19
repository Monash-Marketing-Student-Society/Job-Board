-- Email-keyed admin grants, so access survives a change of identity provider
-- ==========================================================================
-- `admin_users.id` is a foreign key to `auth.users.id` (0001_init.sql:14), so
-- an admin grant is attached to one specific auth account. That held while the
-- only door was the email+password account another admin created by hand: the
-- row was written in the same request that minted the user.
--
-- Google sign-in breaks the assumption. The first Google sign-in can mint a
-- *new* auth user -- a different uuid from any password account the same person
-- already has -- and nothing points that uuid at an admin_users row. The result
-- is the worst kind of failure: the committee member authenticates with Google
-- successfully and is then bounced to the login screen with "You do not have
-- admin access", which reads as a broken login rather than a missing grant.
--
-- This table moves the *grant* onto the email address, which is stable across
-- providers, and leaves admin_users as the id-keyed link that every existing
-- policy already reads through is_admin() (0001_init.sql:80). A row here is a
-- standing invitation; it is claimed on first sign-in, which writes the
-- admin_users row. No existing policy or table changes.

CREATE TABLE IF NOT EXISTS admin_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Stored lowercase and compared lowercase. Postgres has no case-insensitive
  -- TEXT without the citext extension, and an emailed invite that silently
  -- fails to match because someone typed a capital is exactly the bug this
  -- table exists to prevent, so the constraint enforces the normalisation
  -- rather than trusting every call site to remember it.
  email TEXT NOT NULL CHECK (email = lower(email) AND position('@' IN email) > 1),
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claimed_at TIMESTAMPTZ,
  claimed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- One standing grant per address. The claim path upserts on this.
CREATE UNIQUE INDEX IF NOT EXISTS admin_invites_email_key ON admin_invites (email);

ALTER TABLE admin_invites ENABLE ROW LEVEL SECURITY;

-- Only admins can see or manage invitations. The claim itself runs through the
-- service-role client, which bypasses RLS -- it has to, because the user doing
-- the claiming is by definition not yet an admin when it runs.
DROP POLICY IF EXISTS "Admins can read invites" ON admin_invites;
CREATE POLICY "Admins can read invites"
  ON admin_invites
  FOR SELECT
  TO authenticated
  USING (is_admin());

DROP POLICY IF EXISTS "Admins can insert invites" ON admin_invites;
CREATE POLICY "Admins can insert invites"
  ON admin_invites
  FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admins can update invites" ON admin_invites;
CREATE POLICY "Admins can update invites"
  ON admin_invites
  FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admins can delete invites" ON admin_invites;
CREATE POLICY "Admins can delete invites"
  ON admin_invites
  FOR DELETE
  TO authenticated
  USING (is_admin());

-- Base-table privileges, following 0013_grant_base_table_privileges.sql: RLS
-- narrows what a role may touch, but only after the GRANT lets it in at all.
GRANT SELECT, INSERT, UPDATE, DELETE ON admin_invites TO authenticated;
GRANT ALL ON admin_invites TO service_role;
