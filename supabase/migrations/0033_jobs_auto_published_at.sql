-- jobs.auto_published_at: powers the seven-day tier-A audit view
-- ====================================================================
-- A tier-A job publishes unattended, which is the whole point of tier A, but
-- "unattended" still needs a human-reachable undo. This column is what the
-- (not yet built) admin view lists against -- everything auto-published in
-- the last seven days, with one-click unpublish -- separately from
-- created_at, which every job already has and which doesn't distinguish an
-- auto-published row from a manual or reviewed-and-approved one.
--
-- No source_id goes on jobs, deliberately: jobs (source, external_id) has
-- carried a unique partial index since 0001_init.sql, so `source =
-- 'sync:<slug>'` already identifies a synced row and its source without a
-- foreign key. Adding one would mean touching the RLS policy every public
-- reader depends on for a fact the existing column pair already carries, and
-- a text slug survives a `sources` row being deleted where a FK would not.

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS auto_published_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS jobs_auto_published_idx ON jobs (auto_published_at DESC)
  WHERE auto_published_at IS NOT NULL;

COMMENT ON COLUMN jobs.auto_published_at IS
  'Set only when a tier-A sync published this job with no human review. Null for every manual, submission, or reviewed-and-approved staged job. Powers the seven-day auto-publish audit view.';
