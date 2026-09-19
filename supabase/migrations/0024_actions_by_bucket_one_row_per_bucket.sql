-- One row per bucket, not one row per bucket per action
-- ======================================================
-- `analytics_actions_by_bucket` returned a row for every (bucket, action)
-- pair. At the dashboard's widest call -- 180 daily buckets, because the tiles
-- fetch twice the reported window to get their comparison period -- that is
-- 180 x 6 = 1080 rows, and PostgREST caps a response at 1000 (`max-rows`,
-- 1000 by default both locally and on the hosted project).
--
-- The cap does not error. It truncates, and because the function ordered by
-- bucket_start ascending it truncated the *newest* buckets: the series arrived
-- ending fourteen days ago, the client zero-filled the missing days exactly as
-- it is designed to, and the engagement tiles quietly reported a fortnight less
-- traffic than the funnel beside them. On the live board that read as 23 clicks
-- against the funnel's 47.
--
-- It went unnoticed until now because 0021 listed five event types (900 rows,
-- under the cap) and 0023 added `dwell` to the list, taking it to 1080. The
-- shape was always one call away from the ceiling; this removes the ceiling as
-- a consideration rather than buying room under it.
--
-- Pivoting to one row per bucket makes the response 180 rows at the widest
-- call, in line with every other series function here, and the counts ride
-- along as a JSONB object so adding a seventh event type never changes the row
-- count again. The return type changes, so the function has to be dropped
-- rather than replaced.

DROP FUNCTION IF EXISTS analytics_actions_by_bucket(TEXT, INT, TEXT, INT);

CREATE OR REPLACE FUNCTION analytics_actions_by_bucket(
  p_granularity TEXT DEFAULT 'day',
  p_buckets INT DEFAULT 30,
  p_tz TEXT DEFAULT 'Australia/Melbourne',
  p_offset_buckets INT DEFAULT 0
)
RETURNS TABLE (bucket_start TIMESTAMPTZ, counts JSONB)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH actions AS (
    -- The values analytics_events's CHECK constraint allows (0006, widened by
    -- 0007 and 0022). Listed rather than derived so an action with no events
    -- in a bucket still gets a zero in that bucket's object instead of a
    -- missing key.
    SELECT unnest(ARRAY['view', 'click', 'apply', 'apply_confirmed', 'share', 'dwell']) AS action
  ),
  agg AS (
    SELECT
      date_trunc(p_granularity, (e.occurred_at AT TIME ZONE p_tz)) AS bucket_local,
      e.event_type AS action,
      COUNT(*) AS events
    FROM analytics_events e
    WHERE e.occurred_at >= analytics_window_start(p_granularity, p_buckets, p_tz, p_offset_buckets)
      AND e.occurred_at < analytics_window_end(p_granularity, p_tz, p_offset_buckets)
    GROUP BY 1, 2
  )
  SELECT
    (s.bucket_local AT TIME ZONE p_tz)::TIMESTAMPTZ,
    jsonb_object_agg(a.action, COALESCE(g.events, 0))
  FROM analytics_bucket_series(p_granularity, p_buckets, p_tz, p_offset_buckets) AS s(bucket_local)
  CROSS JOIN actions a
  LEFT JOIN agg g
    ON g.bucket_local = s.bucket_local
   AND g.action = a.action
  GROUP BY s.bucket_local
  ORDER BY 1;
$$;

GRANT EXECUTE ON FUNCTION analytics_actions_by_bucket(TEXT, INT, TEXT, INT)
  TO authenticated, service_role;
