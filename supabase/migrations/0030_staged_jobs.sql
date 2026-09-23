-- Staged jobs: synced postings held for review before they reach the board
-- ====================================================================
-- Can't share job_submissions: that table requires submitter_name,
-- submitter_email and submitter_company_name (NOT NULL), and its approve/
-- reject routes email the submitter -- a synced job has no submitter, so
-- reusing it would mean either fabricating submitter fields or reworking
-- the email step for one caller. A separate table keeps both untouched.
--
-- `raw` is the untouched adapter output, kept for debugging a parser without
-- re-fetching. `normalised` is the JobInsert-shaped result the approve route
-- writes to `jobs` unchanged. `confidence` marks which normalised fields were
-- read from structured data versus inferred -- what the admin queue will
-- highlight, so review attention goes to the fields actually worth checking
-- rather than all of them. `risk_reasons` is why it landed here at all,
-- rendered as chips.
--
-- Same write pattern as sources: admin SELECT only. Status transitions
-- (approve/reject) go through API routes running as the service role, not a
-- direct client policy -- unlike job_submissions, which does let an
-- authenticated admin UPDATE it directly. Deliberate tightening: a staged
-- row's approval also has to touch jobs and job_fingerprints in the same
-- transaction, which a bare client UPDATE policy can't coordinate.

CREATE TABLE IF NOT EXISTS staged_jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id     UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  external_id   TEXT,
  raw           JSONB NOT NULL,
  normalised    JSONB NOT NULL,
  fingerprint   TEXT NOT NULL,
  confidence    JSONB NOT NULL DEFAULT '{}'::jsonb,
  risk_reasons  TEXT[] NOT NULL DEFAULT '{}',
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reject_reason TEXT CHECK (
    reject_reason IS NULL OR
    reject_reason IN ('irrelevant', 'duplicate', 'expired', 'employer_blocked', 'bad_link', 'other')
  ),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS staged_jobs_status_idx ON staged_jobs (status);
CREATE INDEX IF NOT EXISTS staged_jobs_source_id_idx ON staged_jobs (source_id);

ALTER TABLE staged_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read staged jobs" ON staged_jobs;
CREATE POLICY "Admins can read staged jobs"
  ON staged_jobs FOR SELECT TO authenticated USING (is_admin());

GRANT SELECT ON staged_jobs TO authenticated;
GRANT ALL ON staged_jobs TO service_role;
