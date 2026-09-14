-- Fixes a check-then-insert race in check_submission_rate_limit()
-- (0017_submission_rate_limits.sql), found in code review of #58.
--
-- The original function had no locking: under Postgres's default READ
-- COMMITTED isolation, two concurrent calls for the same ip_hash could both
-- run `SELECT COUNT(*) ...` and see the same pre-insert count before either
-- of their own INSERTs committed, so both would pass the `attempts >= p_max`
-- check and both return TRUE — letting a concurrent burst through above
-- p_max, exactly the scripted-abuse scenario this function exists to stop.
-- 0017's own comment claimed the function was "atomic within that call so
-- two concurrent requests ... cannot both slip past the limit" — that
-- conflates atomicity of one function body with mutual exclusion between
-- separate invocations, which plpgsql does not provide on its own.
--
-- Fixed with a transaction-scoped advisory lock keyed on the ip_hash, taken
-- before the count. Concurrent calls for the *same* ip_hash now queue behind
-- each other for the duration of the calling transaction (an RPC call's
-- implicit transaction, released automatically at commit or rollback — no
-- separate unlock needed); calls for *different* ip_hash values take
-- different lock keys and never block each other, so this adds no
-- contention between unrelated callers.
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
  PERFORM pg_advisory_xact_lock(hashtext(p_ip_hash)::bigint);

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
