-- Per-bucket action counts
-- ========================
-- The dashboard's headline tiles now carry a movement figure and a sparkline
-- each -- "clicks, 412, +18%, and here is the shape of the last 30 days".
-- Neither was answerable from what existed:
--
--   analytics_action_counts    one total per action, for one window. No shape,
--                              and no way to ask for an earlier window, so no
--                              comparison either.
--   analytics_viewers_by_bucket  has the shape, but only for `view` events.
--
-- This is the second of those generalised to every event type: one row per
-- (bucket, action), zero-filled, over whatever window is asked for. Asking for
-- twice the reported range and splitting the result in half is what produces
-- both halves of a period-over-period comparison in a single round trip --
-- event counts are additive, so the earlier half is exactly the previous
-- window, with none of the arithmetic a "total over 2N minus total over N"
-- trick would need.
--
-- Zero-filling happens here rather than in the page for the same reason it does
-- in analytics_viewers_by_bucket: a missing bucket does not render as a hole,
-- it renders as two non-adjacent days sitting side by side, and a quiet week
-- silently disappears from the line.

CREATE OR REPLACE FUNCTION analytics_actions_by_bucket(
  p_granularity TEXT DEFAULT 'day',
  p_buckets INT DEFAULT 30,
  p_tz TEXT DEFAULT 'Australia/Melbourne'
)
RETURNS TABLE (bucket_start TIMESTAMPTZ, action TEXT, events BIGINT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH actions AS (
    -- The same five values analytics_events's CHECK constraint allows (0006,
    -- widened by 0007). Listed rather than derived so an action with no events
    -- in the window still comes back as a row of zeroes instead of vanishing.
    SELECT unnest(ARRAY['view', 'click', 'apply', 'apply_confirmed', 'share']) AS action
  ),
  agg AS (
    SELECT
      date_trunc(p_granularity, (e.occurred_at AT TIME ZONE p_tz)) AS bucket_local,
      e.event_type AS action,
      COUNT(*) AS events
    FROM analytics_events e
    -- A bare comparison against a constant, so this stays a range scan over
    -- idx_analytics_events_type_occurred_at. Wrapping occurred_at in
    -- date_trunc on this line instead would force a sequential scan.
    WHERE e.occurred_at >= analytics_window_start(p_granularity, p_buckets, p_tz)
    GROUP BY 1, 2
  )
  SELECT
    (s.bucket_local AT TIME ZONE p_tz)::TIMESTAMPTZ,
    a.action,
    COALESCE(g.events, 0)::BIGINT
  FROM analytics_bucket_series(p_granularity, p_buckets, p_tz) AS s(bucket_local)
  CROSS JOIN actions a
  LEFT JOIN agg g
    ON g.bucket_local = s.bucket_local
   AND g.action = a.action
  ORDER BY 1, 2;
$$;

-- Same grants as the three aggregations in 0006: readable by a signed-in admin
-- (RLS on analytics_events still decides that, SECURITY INVOKER keeps it in
-- play) and by the service role the cached dashboard query runs under.
GRANT EXECUTE ON FUNCTION analytics_actions_by_bucket(TEXT, INT, TEXT)
  TO authenticated, service_role;
