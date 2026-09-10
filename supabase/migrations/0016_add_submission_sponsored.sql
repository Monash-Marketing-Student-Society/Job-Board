-- Let a submitter flag on /submit that they want a sponsored (pinned) placement.
--
-- This records the *request* only. Approval still publishes the job with
-- is_sponsored = false; an admin decides sponsorship on the live job as they
-- do today. The column exists so the ask is visible in the admin queue and
-- not lost between the form and the follow-up conversation.

ALTER TABLE job_submissions
  ADD COLUMN IF NOT EXISTS is_sponsored BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN job_submissions.is_sponsored IS
  'Submitter asked for a sponsored/pinned placement. A request only — approval does not carry this to jobs.is_sponsored; an admin sets that on the live job.';
