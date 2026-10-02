-- Approved company logos
-- ====================================================================
-- One row per company an admin has approved a logo for on /admin/logos.
-- The key is the company name folded the way lib/logos.ts comparableName()
-- folds it ("Mars, Inc." and "mars" are one company), so the sync and the
-- approval page agree on which jobs a row covers.
--
-- Used by:
--   - /admin/logos and PUT/DELETE /api/admin/company-logos (writes, as the
--     service role behind the admin check -- no client write policy, same
--     as sources in 0029);
--   - the nightly sync and the review-queue approve, which give a synced
--     job its company's approved logo ahead of the source-domain fallback
--     from 0039.
--
-- Only Brandfetch-hosted logos are stored here (the page refuses others),
-- because Brandfetch's terms require a hotlink and the URL carries our ID.
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS company_logos (
  company_key  TEXT PRIMARY KEY CHECK (company_key <> ''),
  company      TEXT NOT NULL,
  domain       TEXT,
  logo_url     TEXT NOT NULL CHECK (logo_url LIKE 'https://cdn.brandfetch.io/%'),
  approved_by  UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  approved_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE company_logos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read company logos" ON company_logos;
CREATE POLICY "Admins can read company logos"
  ON company_logos FOR SELECT TO authenticated USING (is_admin());
