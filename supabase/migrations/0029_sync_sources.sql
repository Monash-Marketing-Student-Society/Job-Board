-- Sources: one row per employer or aggregator feed the sync pipeline reads
-- ====================================================================
-- Company-level config lives here rather than in code, so adding, pausing or
-- demoting an employer is an admin edit rather than a deploy -- a parser that
-- breaks or starts returning off-target roles drops that employer to tier B
-- (or gets disabled outright) by flipping a row, not shipping a PR.
--
-- `config` (jsonb) holds whatever the adapter needs beyond `endpoint`: query
-- parameters, CSS selectors for the listing-page fallback, tenant ids. Kept
-- schemaless because it varies by adapter kind and the repo is public, so
-- nothing secret ever belongs in it -- these are public URLs and selectors.
--
-- No RLS write policy for authenticated: every write (enable/disable, tier,
-- frequency, config edits) goes through an admin API route running as the
-- service role, same reasoning as staged_jobs below. Direct client writes
-- would mean re-deriving the same authorisation check RLS already does on
-- the worker's own service-role connection, for no benefit.

CREATE TABLE IF NOT EXISTS sources (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         TEXT NOT NULL UNIQUE,   -- becomes jobs.source as 'sync:<slug>'
  name         TEXT NOT NULL,
  tier         TEXT NOT NULL CHECK (tier IN ('A', 'B', 'C')),
  adapter      TEXT NOT NULL CHECK (adapter IN ('ats', 'listing', 'aggregator', 'watcher')),
  endpoint     TEXT NOT NULL,
  config       JSONB NOT NULL DEFAULT '{}'::jsonb,
  frequency    TEXT NOT NULL DEFAULT 'nightly' CHECK (frequency IN ('nightly', 'six_hourly', 'weekly')),
  enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  usual_count  INTEGER,   -- rolling median of successful runs; guards the zero-result sweep
  last_run_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read sources" ON sources;
CREATE POLICY "Admins can read sources"
  ON sources FOR SELECT TO authenticated USING (is_admin());

-- No anon policy: sources are never exposed to the public board, only to the
-- admin dashboard and the worker (service role, bypasses RLS entirely).
GRANT SELECT ON sources TO authenticated;
GRANT ALL ON sources TO service_role;
