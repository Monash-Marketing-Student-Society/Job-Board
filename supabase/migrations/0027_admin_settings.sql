-- Admin settings, and the recovery admin that lives in them
-- =========================================================
-- Every route into the dashboard depends on something outside it: a password
-- someone still remembers, an inbox someone can still reach, a Google account
-- still attached to the right Workspace. When a committee turns over, all
-- three can lapse at once, and nothing in the system can let anyone back in
-- because granting admin requires already being an admin.
--
-- The recovery admin is the way out. It is an address the president and vice
-- president hold, which always carries an admin grant: whoever can read that
-- inbox can do an ordinary password reset and get in. It is deliberately not
-- a way to reset somebody else's account -- that would let whoever holds the
-- inbox take over any admin at will. It only ever restores access to itself.
--
-- Stored here rather than in an environment variable because the committee has
-- to be able to change it from /admin/users when the mailbox changes, without
-- a deploy.

CREATE TABLE IF NOT EXISTS admin_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Seeded, not left null: a recovery admin that has to be configured before it
-- works is not a safety net, because the moment you need it is the moment
-- nobody can sign in to configure it.
INSERT INTO admin_settings (key, value)
VALUES ('recovery_admin_email', 'mmss@monashclubs.org')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE admin_settings ENABLE ROW LEVEL SECURITY;

-- Admins only. The sign-in page needs the recovery address while signed out,
-- but it reads it through a route that returns that one value rather than
-- opening this table to anon, which would expose every setting added later.
DROP POLICY IF EXISTS "Admins can read settings" ON admin_settings;
CREATE POLICY "Admins can read settings"
  ON admin_settings FOR SELECT TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "Admins can update settings" ON admin_settings;
CREATE POLICY "Admins can update settings"
  ON admin_settings FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admins can insert settings" ON admin_settings;
CREATE POLICY "Admins can insert settings"
  ON admin_settings FOR INSERT TO authenticated WITH CHECK (is_admin());

GRANT SELECT, INSERT, UPDATE ON admin_settings TO authenticated;
GRANT ALL ON admin_settings TO service_role;
