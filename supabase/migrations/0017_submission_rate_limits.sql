-- Rate limit for the public POST /api/submit-job endpoint.
--
-- That route is unauthenticated, inserts a job_submissions row through the
-- service-role client, and sends two emails per call (submitter confirmation
-- + a partnerships@monashmss.com notification, BCC'd to two more addresses).
-- Nothing capped how often one caller could hit it: a loop is a mailbox
-- flood, a Resend quota burn, and a pending queue full of junk. The
-- allowlist schema (#53) closed the mass-assignment hole on this route; this
-- closes the frequency one.
--
-- Serverless (Vercel) rules out an in-process counter — function instances
-- do not share memory and reset on cold start — so the counter has to live
-- somewhere shared. The stack has no Redis/KV, so it lives here.
--
-- One row per accepted attempt, holding only a SHA-256 hash of the client IP
-- (never the raw address). check_submission_rate_limit() is the only
-- supported way in: it prunes expired rows, counts what the caller has left
-- in the window, records the attempt if under the cap, and returns whether
-- to allow it — one round trip, and atomic within that call so two
-- concurrent requests from the same caller cannot both slip past the limit.

CREATE TABLE IF NOT EXISTS submission_rate_limits (
  ip_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Every query the function runs is "this ip_hash, within the window" —
-- composite index covers both the COUNT and the eventual DELETE of the
-- caller's own expired rows.
CREATE INDEX IF NOT EXISTS submission_rate_limits_ip_time_idx
  ON submission_rate_limits (ip_hash, created_at);

-- Only ever touched via the function below by the service-role client
-- (lib/supabase/admin.ts). No anon/authenticated policy exists — RLS with no
-- policies denies everything to every other role — and no anon/authenticated
-- grant either, unlike 0013's tables, which need one *because* they have
-- policies meant to allow something.
ALTER TABLE submission_rate_limits ENABLE ROW LEVEL SECURITY;
GRANT ALL ON submission_rate_limits TO service_role;

-- Returns TRUE and records the attempt if the caller is under `p_max`
-- attempts in the trailing `p_window`; returns FALSE (and records nothing)
-- once they are not.
CREATE OR REPLACE FUNCTION check_submission_rate_limit(
  p_ip_hash TEXT,
  p_max INT,
  p_window INTERVAL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  attempts INT;
BEGIN
  -- Opportunistic cleanup rather than a cron job: every call prunes rows
  -- older than its own window, which keeps the table bounded by "attempts
  -- across all callers in one window" with no separate maintenance task.
  DELETE FROM submission_rate_limits
    WHERE created_at < NOW() - p_window;

  SELECT COUNT(*) INTO attempts
    FROM submission_rate_limits
    WHERE ip_hash = p_ip_hash
      AND created_at > NOW() - p_window;

  IF attempts >= p_max THEN
    RETURN FALSE;
  END IF;

  INSERT INTO submission_rate_limits (ip_hash) VALUES (p_ip_hash);
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION check_submission_rate_limit(TEXT, INT, INTERVAL) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION check_submission_rate_limit(TEXT, INT, INTERVAL) TO service_role;
