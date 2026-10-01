-- The second sync source: Ogilvy Australia's Greenhouse board
-- ====================================================================
-- The first Greenhouse employer on the allowlist. Verified live on 30 Sep
-- 2026: 7 postings, one GET (boards-api.greenhouse.io/v1/boards/ogilvyaus/
-- jobs?content=true); the targeting gates reject 4 (Perth, or above entry
-- level) and send 3 Sydney/Melbourne postings to review.
--
-- Review-only by construction, like 0034: `config` has no `auto_publish`.
-- In practice Greenhouse can't clear the risk checks anyway -- the board
-- carries no employment type and no closing date for this employer -- so
-- every posting is held for missing_job_type / missing_closing_date whatever
-- the switch says.
--
-- ON CONFLICT DO NOTHING: once the row exists, admins own it (tier, enabled,
-- config) from /admin/sources. Re-running this must never undo a demotion
-- or a pause.

INSERT INTO sources (slug, name, tier, adapter, endpoint, config, frequency, enabled)
VALUES (
  'ogilvy',
  'Ogilvy',
  'A',
  'ats',
  'https://boards-api.greenhouse.io/v1/boards/ogilvyaus',
  '{"vendor": "greenhouse"}'::jsonb,
  'nightly',
  TRUE
)
ON CONFLICT (slug) DO NOTHING;
