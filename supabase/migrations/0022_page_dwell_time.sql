-- Time on page
-- ============
-- The dashboard reported "views per viewer" as its depth measure, which is a
-- count standing in for an interest signal: two listings opened for three
-- seconds each outscores one read end to end. Nothing in the schema could say
-- how long anybody actually stayed, because every event was an instant.
--
-- This adds the missing dimension as a sixth event type. `dwell` is emitted
-- once per listing, when the visitor closes it or leaves the tab, and carries
-- the foreground time they spent on it in `duration_ms`.
--
-- A separate event rather than a column on `view`: the view has to be recorded
-- the moment the listing opens (a visitor who never comes back still viewed
-- it), and the duration is only known when they leave. Updating the earlier row
-- would mean the tracking endpoint could rewrite history it did not write, and
-- `analytics_events` is deliberately insert-only.

ALTER TABLE analytics_events
  ADD COLUMN IF NOT EXISTS duration_ms INTEGER;

COMMENT ON COLUMN analytics_events.duration_ms IS
  'Foreground milliseconds on a listing. Set on `dwell` events only; NULL everywhere else.';

ALTER TABLE analytics_events
  DROP CONSTRAINT IF EXISTS analytics_events_event_type_check;

ALTER TABLE analytics_events
  ADD CONSTRAINT analytics_events_event_type_check
  CHECK (event_type IN ('view', 'click', 'apply', 'apply_confirmed', 'share', 'dwell'));

-- Bounds, enforced here as well as in the route. The lower bound drops the
-- accidental open — a listing dismissed in under a second says nothing about
-- interest. The upper bound (30 minutes) is what stops one forgotten tab from
-- owning the average: a browser that never fires its unload handler until the
-- machine wakes up the next morning would otherwise contribute a nine-hour
-- "read".
ALTER TABLE analytics_events
  DROP CONSTRAINT IF EXISTS analytics_events_duration_check;

ALTER TABLE analytics_events
  ADD CONSTRAINT analytics_events_duration_check
  CHECK (
    (event_type = 'dwell' AND duration_ms BETWEEN 1000 AND 1800000)
    OR (event_type <> 'dwell' AND duration_ms IS NULL)
  );

-- Average time on page per bucket.
--
-- Returns the sample count alongside the average so the caller can re-weight
-- across buckets: a window's average is not the average of its daily averages
-- when the days carry different numbers of readers, and the dashboard compares
-- one window against another.
CREATE OR REPLACE FUNCTION analytics_dwell_by_bucket(
  p_granularity TEXT DEFAULT 'day',
  p_buckets INT DEFAULT 30,
  p_tz TEXT DEFAULT 'Australia/Melbourne'
)
RETURNS TABLE (bucket_start TIMESTAMPTZ, avg_ms NUMERIC, samples BIGINT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH agg AS (
    SELECT
      date_trunc(p_granularity, (e.occurred_at AT TIME ZONE p_tz)) AS bucket_local,
      AVG(e.duration_ms)::NUMERIC AS avg_ms,
      COUNT(*)::BIGINT AS samples
    FROM analytics_events e
    WHERE e.event_type = 'dwell'
      AND e.duration_ms IS NOT NULL
      -- Bare comparison against a constant, so this stays a range scan over
      -- idx_analytics_events_type_occurred_at.
      AND e.occurred_at >= analytics_window_start(p_granularity, p_buckets, p_tz)
    GROUP BY 1
  )
  SELECT
    (s.bucket_local AT TIME ZONE p_tz)::TIMESTAMPTZ,
    COALESCE(a.avg_ms, 0)::NUMERIC,
    COALESCE(a.samples, 0)::BIGINT
  FROM analytics_bucket_series(p_granularity, p_buckets, p_tz) AS s(bucket_local)
  LEFT JOIN agg a ON a.bucket_local = s.bucket_local
  ORDER BY 1;
$$;

GRANT EXECUTE ON FUNCTION analytics_dwell_by_bucket(TEXT, INT, TEXT)
  TO authenticated, service_role;
