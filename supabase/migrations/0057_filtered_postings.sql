-- Filtered postings: what the targeting gate removed, and why
-- ====================================================================
-- Until now a gate reject was only a number on sync_runs.rejected -- the
-- posting itself was dropped, so a wrong removal (a good graduate role
-- caught by a new rule) could never be seen, let alone undone. During the
-- filter trial (Oct 2026) admins review this list at /admin/filters and can
-- restore a posting to the review queue.
--
-- One row per posting per source, keyed like the apply-URL identity check
-- (0031): a rejected posting has no fingerprint, so it comes back every
-- night, and record_filtered_posting folds each sighting into the same row
-- (seen_count / last_seen_at) instead of adding another. `normalised` is
-- kept whole because a restore stages it unchanged. Rows unseen for 30 days
-- are pruned by the maintain task: the posting is gone from the employer's
-- site, so there is nothing left to restore.
--
-- `status` stays 'restored' once set, even as later runs keep re-sighting
-- the posting -- the restored copy is in staged_jobs with a fingerprint, so
-- dedup handles it from there.
--
-- Same write pattern as staged_jobs (0030): admin SELECT only, writes
-- through the service role.

CREATE TABLE IF NOT EXISTS filtered_postings (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id      UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  external_id    TEXT,
  apply_url_hash TEXT NOT NULL,
  normalised     JSONB NOT NULL,
  rule           TEXT NOT NULL,
  evidence       TEXT,
  status         TEXT NOT NULL DEFAULT 'filtered' CHECK (status IN ('filtered', 'restored')),
  restored_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  restored_at    TIMESTAMPTZ,
  seen_count     INTEGER NOT NULL DEFAULT 1,
  first_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_id, apply_url_hash)
);

CREATE INDEX IF NOT EXISTS filtered_postings_status_seen_idx ON filtered_postings (status, last_seen_at DESC);

ALTER TABLE filtered_postings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read filtered postings" ON filtered_postings;
CREATE POLICY "Admins can read filtered postings"
  ON filtered_postings FOR SELECT TO authenticated USING (is_admin());

GRANT SELECT ON filtered_postings TO authenticated;
GRANT ALL ON filtered_postings TO service_role;

-- One sighting from the nightly run. An upsert with an increment, which
-- supabase-js can't express on its own.
CREATE OR REPLACE FUNCTION record_filtered_posting(
  p_source_id UUID,
  p_external_id TEXT,
  p_apply_url_hash TEXT,
  p_normalised JSONB,
  p_rule TEXT,
  p_evidence TEXT
) RETURNS VOID
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  INSERT INTO filtered_postings (source_id, external_id, apply_url_hash, normalised, rule, evidence)
  VALUES (p_source_id, p_external_id, p_apply_url_hash, p_normalised, p_rule, p_evidence)
  ON CONFLICT (source_id, apply_url_hash) DO UPDATE SET
    external_id  = EXCLUDED.external_id,
    normalised   = EXCLUDED.normalised,
    rule         = EXCLUDED.rule,
    evidence     = EXCLUDED.evidence,
    seen_count   = filtered_postings.seen_count + 1,
    last_seen_at = NOW();
$$;

REVOKE ALL ON FUNCTION record_filtered_posting(UUID, TEXT, TEXT, JSONB, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION record_filtered_posting(UUID, TEXT, TEXT, JSONB, TEXT, TEXT) TO service_role;
