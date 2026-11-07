-- LinkedIn availability checks in the Bright Data ledger
-- ====================================================================
-- The maintain task now asks Bright Data every other day whether the live
-- and in-review LinkedIn jobs are still taking applications (7 Nov 2026:
-- 10 of 50 live jobs had closed on LinkedIn). Those lookups come out of the
-- same monthly record pool, so they go in the same ledger under their own
-- kind -- findResumable reads only 'jobs', so one is never resumed as a
-- search.

ALTER TABLE brightdata_snapshots DROP CONSTRAINT IF EXISTS brightdata_snapshots_kind_check;
ALTER TABLE brightdata_snapshots
  ADD CONSTRAINT brightdata_snapshots_kind_check CHECK (kind IN ('jobs', 'companies', 'availability'));
