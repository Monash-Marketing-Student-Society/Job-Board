-- Every live job must have a logo
-- ====================================================================
-- The admins' rule (15 Oct 2026): no job goes on the board without a
-- company logo. The app enforces it on every path that publishes -- the
-- sync holds a logo-less job for review ('missing_logo'), both approve
-- routes refuse one, and the admin form and bulk import require one. This
-- is the backstop for anything that slips past them, including a client
-- update that re-activates a logo-less job.
--
-- NOT VALID: rows already live without a logo are left for an admin to fix
-- or take down, rather than failing the migration. New inserts and any
-- update to a row are checked.

ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_live_needs_logo;
ALTER TABLE jobs
  ADD CONSTRAINT jobs_live_needs_logo
  CHECK (NOT is_active OR NULLIF(BTRIM(company_logo_url), '') IS NOT NULL)
  NOT VALID;
