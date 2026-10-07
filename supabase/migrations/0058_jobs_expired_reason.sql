-- Why the nightly maintenance took a job down, and when
-- ====================================================================
-- A job can now be listed with no closing date (the "No closing date"
-- checkbox). Nothing time-based would ever take such a job down, so the
-- nightly maintain task checks it three ways instead: the posting page says
-- it has closed, a synced job has dropped out of its source's feed, or it has
-- been up 60 days. This records which of those (or the older reasons: the
-- closing date passed, the link died) unpublished a job, so Manage Jobs can
-- say why it went inactive.
--
-- expired_at also restarts the 60-day clock: an admin who re-lists an
-- open-ended job after it was taken down gets another 60 days, counted from
-- the take-down rather than from when the job was first created.
--
-- Both are cleared to NULL / kept respectively when an admin re-activates a
-- job; a manual Deactivate leaves both NULL.

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS expired_reason TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS expired_at TIMESTAMPTZ;

ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_expired_reason_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_expired_reason_check CHECK (
  expired_reason IS NULL OR expired_reason IN (
    'closing_date_passed',
    'link_dead',
    'page_says_closed',
    'gone_from_feed',
    'open_ended_60_days'
  )
);

COMMENT ON COLUMN jobs.expired_reason IS
  'Why the nightly maintain task unpublished this job. NULL for a job an admin deactivated by hand, or one re-activated since.';
COMMENT ON COLUMN jobs.expired_at IS
  'When the maintain task last unpublished this job. A job with no closing date is taken down 60 days after the later of created_at and this.';
