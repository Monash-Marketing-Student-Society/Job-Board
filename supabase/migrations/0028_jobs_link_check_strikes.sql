-- Link-check strikes, and when a job's apply link was last confirmed
-- ====================================================================
-- The nightly link check unpublishes a job outright on a 404, a 410, or a
-- redirect into something generic (a careers index, a home page) -- those are
-- unambiguous. A timeout, a 5xx, or an ambiguous status (a bot wall, a rate
-- limit) is not: an employer's site having one bad night is not a reason to
-- drop their role, so that counts a strike instead of unpublishing
-- immediately, and three consecutive strikes is what unpublishes. A single
-- confirmed-OK check resets the counter to zero, so a genuinely flaky site
-- does not creep towards unpublish across unrelated bad nights months apart.
--
-- This applies to every published job the check walks, not only synced ones --
-- the same as the closing-date sweep it runs alongside.

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS link_check_strikes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS link_checked_at TIMESTAMPTZ;

COMMENT ON COLUMN jobs.link_check_strikes IS
  'Consecutive link checks that could not confirm the apply URL (timeout, 5xx, or an ambiguous status). Reset to 0 on any confirmed-OK check. The job is unpublished once this reaches 3.';
COMMENT ON COLUMN jobs.link_checked_at IS
  'When the nightly link check last evaluated this job''s apply URL, regardless of outcome.';
