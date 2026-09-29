-- The first sync source: Unilever's early-careers Workday tenant
-- ====================================================================
-- Phase 1 of the job sync ships one adapter against one employer, everything
-- routed to review. This is that employer. Verified live on 24 Sep 2026:
-- 16 postings, almost all UK/Singapore (the targeting gates reject those on
-- location), with one Sydney posting that reaches the review queue.
--
-- Review-only by construction: `config` has no `auto_publish`, so every
-- posting from this source lands in staged_jobs for an admin, whatever its
-- risk. Flipping `config.auto_publish` to true is the phase-2 decision, made
-- per source once the soak shows its rejects stay under 10%.
--
-- ON CONFLICT DO NOTHING rather than an upsert: once this row exists, admins
-- own it (tier, enabled, config). Re-running this must never overwrite a
-- demotion or a pause.

INSERT INTO sources (slug, name, tier, adapter, endpoint, config, frequency, enabled)
VALUES (
  'unilever',
  'Unilever',
  'A',
  'ats',
  'https://unilever.wd3.myworkdayjobs.com/wday/cxs/unilever/Unilever_Early_Careers',
  '{"vendor": "workday"}'::jsonb,
  'nightly',
  TRUE
)
ON CONFLICT (slug) DO NOTHING;
