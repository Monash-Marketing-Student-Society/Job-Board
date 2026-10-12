-- LinkedIn employer sizes, for the Sydney size rule
-- ====================================================================
-- The admins' rule (12 Oct 2026): a Sydney LinkedIn internship needs an
-- employer of 1,000+ people, any other Sydney role 51+ -- a Melbourne
-- student rarely moves for a small firm's internship. LinkedIn's job feed
-- carries no size, so the LinkedIn run looks each new Sydney employer up in
-- Bright Data's "LinkedIn companies" dataset once and caches it here.
--
-- `employees_min` is the lower bound of LinkedIn's size band ("51-200
-- employees" -> 51), which is what the rule compares; NULL when the lookup
-- returned no size, and a job from that employer then goes to review.
-- Same write pattern as filtered_postings (0057): admin SELECT only, writes
-- through the service role.

CREATE TABLE IF NOT EXISTS linkedin_companies (
  company_id            TEXT PRIMARY KEY,
  company_url           TEXT NOT NULL,
  name                  TEXT,
  company_size          TEXT,
  employees_min         INTEGER CHECK (employees_min IS NULL OR employees_min >= 0),
  employees_on_linkedin INTEGER,
  fetched_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE linkedin_companies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read LinkedIn companies" ON linkedin_companies;
CREATE POLICY "Admins can read LinkedIn companies"
  ON linkedin_companies FOR SELECT TO authenticated USING (is_admin());

GRANT SELECT ON linkedin_companies TO authenticated;
GRANT ALL ON linkedin_companies TO service_role;

-- Company lookups are bought from the same 5,000-record monthly pool as the
-- job searches, so they go in the same ledger and count against the same
-- cap. `kind` keeps a company snapshot from being resumed as a job search.
ALTER TABLE brightdata_snapshots
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'jobs' CHECK (kind IN ('jobs', 'companies'));
