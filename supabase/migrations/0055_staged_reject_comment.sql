-- Reject comments and the trial filter's reasons
-- ====================================================================
-- During the filter trial (Oct 2026) admins say *why* a synced job was
-- wrong, in their own words, so the rules in lib/sync/target.ts and
-- lib/sync/experience.ts can be tuned from real decisions. Optional, capped
-- so a pasted job ad doesn't end up here.
--
-- 'too_senior' and 'experience_required' are the two most common reasons
-- the committee rejects a role, and the two the gate itself now removes --
-- so a recheck of the pending queue rejects under the same names a human
-- would pick.

ALTER TABLE staged_jobs ADD COLUMN IF NOT EXISTS reject_comment TEXT;

ALTER TABLE staged_jobs DROP CONSTRAINT IF EXISTS staged_jobs_reject_comment_check;
ALTER TABLE staged_jobs ADD CONSTRAINT staged_jobs_reject_comment_check
  CHECK (reject_comment IS NULL OR char_length(reject_comment) <= 500);

ALTER TABLE staged_jobs DROP CONSTRAINT IF EXISTS staged_jobs_reject_reason_check;
ALTER TABLE staged_jobs ADD CONSTRAINT staged_jobs_reject_reason_check CHECK (
  reject_reason IS NULL OR
  reject_reason IN (
    'irrelevant', 'duplicate', 'expired', 'employer_blocked', 'bad_link', 'other',
    'too_senior', 'experience_required'
  )
);
