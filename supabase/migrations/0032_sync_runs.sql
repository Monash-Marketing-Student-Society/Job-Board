-- Sync runs: one row per adapter run, so a silent parser failure is visible
-- ====================================================================
-- The TDD names these columns without spelling out the full DDL (the
-- worker's own record-keeping, not its data model per se); written out here
-- in full, following the same shape as the rest of the sync schema.
--
-- One row per source per run, not one row per overall pass -- "which source
-- broke" has to be answerable without cross-referencing anything else, since
-- this is exactly what the (not yet built) admin sources page and the digest
-- email read to show "last run per source" and flag a parser that quietly
-- returns nothing. `zero_guard_tripped` is what lets the expiry sweep tell a
-- genuinely quiet source from a broken one, per sources.usual_count.

CREATE TABLE IF NOT EXISTS sync_runs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id           UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at         TIMESTAMPTZ,
  seen                INTEGER NOT NULL DEFAULT 0,
  created             INTEGER NOT NULL DEFAULT 0,
  deduped             INTEGER NOT NULL DEFAULT 0,
  rejected            INTEGER NOT NULL DEFAULT 0,
  held                INTEGER NOT NULL DEFAULT 0,
  error               TEXT,
  zero_guard_tripped  BOOLEAN NOT NULL DEFAULT FALSE
);

-- "Last run per source" is the query the admin sources page and the digest
-- both make; DESC on started_at so LIMIT 1 per source_id gets the most recent.
CREATE INDEX IF NOT EXISTS sync_runs_source_started_idx ON sync_runs (source_id, started_at DESC);

ALTER TABLE sync_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read sync runs" ON sync_runs;
CREATE POLICY "Admins can read sync runs"
  ON sync_runs FOR SELECT TO authenticated USING (is_admin());

GRANT SELECT ON sync_runs TO authenticated;
GRANT ALL ON sync_runs TO service_role;
