-- LinkedIn via Bright Data: the spend ledger, a staged-job identity index, and the source row
-- ====================================================================
-- brightdata_snapshots: one row per snapshot bought from Bright Data. The
-- free plan is 5,000 records a month and nothing else stops a run from
-- spending past it, so the adapter reads this table before every trigger
-- (lib/sync/snapshot-ledger.ts) and refuses a run whose worst case would
-- cross the cap. `max_records` is that worst case (inputs x per-input
-- limit), counted until `records` -- what was actually delivered -- is
-- known. Rows are written on dry runs too, since Bright Data bills them.
-- `posting_ids` are every posting bought, kept and rejected alike, so the
-- next search can pass them as jobs_to_not_include instead of paying for
-- them again. A row left 'triggered' (the run died waiting) is collected
-- by the next run rather than re-bought.

CREATE TABLE IF NOT EXISTS brightdata_snapshots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id     UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  snapshot_id   TEXT NOT NULL UNIQUE,
  inputs        JSONB NOT NULL DEFAULT '[]'::jsonb,
  max_records   INTEGER NOT NULL CHECK (max_records >= 0),
  records       INTEGER CHECK (records IS NULL OR records >= 0),
  posting_ids   TEXT[] NOT NULL DEFAULT '{}',
  status        TEXT NOT NULL DEFAULT 'triggered' CHECK (status IN ('triggered', 'collected', 'failed')),
  dry_run       BOOLEAN NOT NULL DEFAULT FALSE,
  error         TEXT,
  triggered_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS brightdata_snapshots_source_triggered_idx
  ON brightdata_snapshots (source_id, triggered_at DESC);

ALTER TABLE brightdata_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read Bright Data snapshots" ON brightdata_snapshots;
CREATE POLICY "Admins can read Bright Data snapshots"
  ON brightdata_snapshots FOR SELECT TO authenticated USING (is_admin());

GRANT SELECT ON brightdata_snapshots TO authenticated;
GRANT ALL ON brightdata_snapshots TO service_role;

-- staged_jobs had no unique key on a source's own posting id; dedup relied
-- on the fingerprint alone, so two runs racing over the same snapshot could
-- both stage a row. jobs has had the matching index since 0001_init.sql.
-- Prod had no duplicates when this was written (checked 3 Oct 2026).
CREATE UNIQUE INDEX IF NOT EXISTS staged_jobs_source_external_id_key
  ON staged_jobs (source_id, external_id)
  WHERE external_id IS NOT NULL;

-- The source. Tier C is the TDD's LinkedIn rank (lib/sync/dedup.ts): the
-- employer's own posting always outranks a LinkedIn copy of it, and tier C
-- is always held for review. 'weekly' keeps it out of the nightly pass; it
-- has its own Monday/Thursday schedule (src/trigger/sync.ts). Consent:
-- MMSS's permission to read LinkedIn listings through Bright Data was
-- confirmed on 3 Oct 2026.
INSERT INTO sources (slug, name, tier, adapter, endpoint, config, frequency, enabled)
VALUES (
  'linkedin',
  'LinkedIn',
  'C',
  'aggregator',
  'https://api.brightdata.com/datasets/v3',
  jsonb_build_object(
    'vendor', 'linkedin',
    'dataset_id', 'gd_lpfll7v5hcqtkxl6l',
    'monthly_cap', 4000,
    'consent', jsonb_build_object(
      'type', 'explicit',
      'note', 'Permission to read LinkedIn job listings via Bright Data confirmed by MMSS',
      'recorded_at', '2026-10-03'
    )
  ),
  'weekly',
  TRUE
)
ON CONFLICT (slug) DO NOTHING;
