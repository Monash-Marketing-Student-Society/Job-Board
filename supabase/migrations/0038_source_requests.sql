-- Source requests: employers asking MMSS to list their roles automatically
-- ====================================================================
-- The "List your roles with MMSS" form (/submit/feed) writes one row per
-- request. The employer pastes their careers link and confirms MMSS may show
-- their public listings -- that confirmation is the explicit consent the
-- source check (lib/sync/robots.ts) accepts, so an approved request becomes
-- a source with config.consent.type = 'explicit'.
--
-- `detected_vendor` / `detected_endpoint` are what lib/sync/detect-ats.ts
-- read from the link at submission; null means a job system we have no
-- adapter for, which an admin follows up by hand.
--
-- Same access shape as staged_jobs: admins read through their own session,
-- every write goes through a route running as the service role.

CREATE TABLE IF NOT EXISTS source_requests (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name       TEXT NOT NULL,
  contact_name       TEXT NOT NULL,
  contact_email      TEXT NOT NULL,
  careers_url        TEXT NOT NULL,
  detected_vendor    TEXT CHECK (detected_vendor IS NULL OR detected_vendor IN ('workday', 'greenhouse')),
  detected_endpoint  TEXT,
  consent_confirmed  BOOLEAN NOT NULL CHECK (consent_confirmed),
  status             TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  source_id          UUID REFERENCES sources(id) ON DELETE SET NULL,
  reviewed_by        UUID REFERENCES auth.users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS source_requests_status_idx ON source_requests (status, created_at DESC);

ALTER TABLE source_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read source requests" ON source_requests;
CREATE POLICY "Admins can read source requests"
  ON source_requests FOR SELECT TO authenticated USING (is_admin());

GRANT SELECT ON source_requests TO authenticated;
GRANT ALL ON source_requests TO service_role;
