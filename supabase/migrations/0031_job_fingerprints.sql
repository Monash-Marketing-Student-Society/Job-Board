-- Job fingerprints: the dedup index shared across every tier
-- ====================================================================
-- A hash of normalised employer + normalised title + city (closing date
-- deliberately excluded -- an extended deadline, or one an adapter guessed,
-- would otherwise mint a second listing for the same role). The pipeline
-- logic that computes it and decides what a match means lives in
-- lib/sync/fingerprint.ts (a later PR); this table is just where it's kept.
--
-- `job_id` is nullable because a fingerprint can point at a staged job that
-- hasn't been approved yet -- both `job_id` and `staged_job_id` may be set as
-- a row moves from staged to live, and both may be null only in the instant
-- between insert and the rest of that same transaction. `apply_url_hash` is a
-- second index: the normalised destination URL (tracking parameters and
-- aggregator redirects stripped) catches the same posting syndicated to two
-- different boards, which the content fingerprint alone would miss if the
-- title differs slightly between them.

CREATE TABLE IF NOT EXISTS job_fingerprints (
  fingerprint    TEXT PRIMARY KEY,
  source_id      UUID REFERENCES sources(id) ON DELETE SET NULL,
  job_id         UUID REFERENCES jobs(id) ON DELETE CASCADE,
  staged_job_id  UUID REFERENCES staged_jobs(id) ON DELETE CASCADE,
  apply_url_hash TEXT NOT NULL,
  source_job_id  TEXT,
  seen_count     INTEGER NOT NULL DEFAULT 1,
  first_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS job_fingerprints_apply_url_idx ON job_fingerprints (apply_url_hash);
CREATE INDEX IF NOT EXISTS job_fingerprints_job_id_idx ON job_fingerprints (job_id) WHERE job_id IS NOT NULL;

ALTER TABLE job_fingerprints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read job fingerprints" ON job_fingerprints;
CREATE POLICY "Admins can read job fingerprints"
  ON job_fingerprints FOR SELECT TO authenticated USING (is_admin());

GRANT SELECT ON job_fingerprints TO authenticated;
GRANT ALL ON job_fingerprints TO service_role;
