-- Arbitrary reporting windows
-- ===========================
-- Every aggregation on the dashboard could only ever answer "the last N
-- buckets, ending now". That was enough while the page offered three presets,
-- all of which end today. It is not enough for "1 August to 31 August", which
-- ends six weeks in the past.
--
-- `analytics_interest_breakdown` already solved this in 0008 by taking
-- `p_offset_buckets`, which slides the whole window back by N buckets while
-- keeping its length. This migration gives the same parameter to the rest of
-- them, so one number describes the window for every query on the page:
--
--     p_buckets         how long the window is
--     p_offset_buckets  how far back it ends (0 = ending now)
--
-- The two helpers go first, because every aggregate derives its bounds from
-- them. Each function has to be dropped rather than replaced: CREATE OR
-- REPLACE only matches an identical argument list, so adding a defaulted
-- parameter would leave both versions resident and make the existing
-- three-argument calls ambiguous.

DROP FUNCTION IF EXISTS analytics_window_start(TEXT, INT, TEXT);

CREATE OR REPLACE FUNCTION analytics_window_start(
  p_granularity TEXT,
  p_buckets INT,
  p_tz TEXT,
  p_offset_buckets INT DEFAULT 0
)
RETURNS TIMESTAMPTZ
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT (
    date_trunc(p_granularity, (now() AT TIME ZONE p_tz))
      - (GREATEST(p_buckets, 1) - 1 + GREATEST(p_offset_buckets, 0))
        * analytics_bucket_step(p_granularity)
  ) AT TIME ZONE p_tz;
$$;

-- The exclusive upper bound: the start of the bucket *after* the last one in
-- the window. At offset 0 that is the start of the next bucket, which is in
-- the future and therefore never excludes anything — so existing callers that
-- do not pass an offset keep the behaviour they have always had.
CREATE OR REPLACE FUNCTION analytics_window_end(
  p_granularity TEXT,
  p_tz TEXT,
  p_offset_buckets INT DEFAULT 0
)
RETURNS TIMESTAMPTZ
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT (
    date_trunc(p_granularity, (now() AT TIME ZONE p_tz))
      - (GREATEST(p_offset_buckets, 0) - 1) * analytics_bucket_step(p_granularity)
  ) AT TIME ZONE p_tz;
$$;

DROP FUNCTION IF EXISTS analytics_bucket_series(TEXT, INT, TEXT);

CREATE OR REPLACE FUNCTION analytics_bucket_series(
  p_granularity TEXT,
  p_buckets INT,
  p_tz TEXT,
  p_offset_buckets INT DEFAULT 0
)
RETURNS SETOF TIMESTAMP
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT generate_series(
    date_trunc(p_granularity, (now() AT TIME ZONE p_tz))
      - (GREATEST(p_buckets, 1) - 1 + GREATEST(p_offset_buckets, 0))
        * analytics_bucket_step(p_granularity),
    date_trunc(p_granularity, (now() AT TIME ZONE p_tz))
      - GREATEST(p_offset_buckets, 0) * analytics_bucket_step(p_granularity),
    analytics_bucket_step(p_granularity)
  );
$$;

-- =====================
-- AGGREGATES
-- =====================
-- All three take the offset, pass it to the helpers, and gain an upper bound.
-- Both bounds stay plain timestamptz constants so the scans stay sargable
-- against idx_analytics_events_occurred_at — the same reason 0006 refuses to
-- wrap occurred_at in date_trunc.

DROP FUNCTION IF EXISTS analytics_viewers_by_bucket(TEXT, INT, TEXT);

CREATE OR REPLACE FUNCTION analytics_viewers_by_bucket(
  p_granularity TEXT DEFAULT 'month',
  p_buckets INT DEFAULT 12,
  p_tz TEXT DEFAULT 'Australia/Melbourne',
  p_offset_buckets INT DEFAULT 0
)
RETURNS TABLE (bucket_start TIMESTAMPTZ, viewers BIGINT, views BIGINT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH agg AS (
    SELECT
      date_trunc(p_granularity, (e.occurred_at AT TIME ZONE p_tz)) AS bucket_local,
      COUNT(DISTINCT e.visitor_id) AS viewers,
      COUNT(*) AS views
    FROM analytics_events e
    WHERE e.event_type = 'view'
      AND e.occurred_at >= analytics_window_start(p_granularity, p_buckets, p_tz, p_offset_buckets)
      AND e.occurred_at < analytics_window_end(p_granularity, p_tz, p_offset_buckets)
    GROUP BY 1
  )
  SELECT
    (s.bucket_local AT TIME ZONE p_tz)::TIMESTAMPTZ,
    COALESCE(a.viewers, 0)::BIGINT,
    COALESCE(a.views, 0)::BIGINT
  FROM analytics_bucket_series(p_granularity, p_buckets, p_tz, p_offset_buckets) AS s(bucket_local)
  LEFT JOIN agg a ON a.bucket_local = s.bucket_local
  ORDER BY 1;
$$;

DROP FUNCTION IF EXISTS analytics_action_counts(TEXT, INT, TEXT);

CREATE OR REPLACE FUNCTION analytics_action_counts(
  p_granularity TEXT DEFAULT 'month',
  p_buckets INT DEFAULT 12,
  p_tz TEXT DEFAULT 'Australia/Melbourne',
  p_offset_buckets INT DEFAULT 0
)
RETURNS TABLE (action TEXT, events BIGINT, distinct_jobs BIGINT, visitors BIGINT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    e.event_type,
    COUNT(*)::BIGINT,
    COUNT(DISTINCT e.job_id)::BIGINT,
    COUNT(DISTINCT e.visitor_id)::BIGINT
  FROM analytics_events e
  WHERE e.occurred_at >= analytics_window_start(p_granularity, p_buckets, p_tz, p_offset_buckets)
    AND e.occurred_at < analytics_window_end(p_granularity, p_tz, p_offset_buckets)
  GROUP BY e.event_type
  ORDER BY 1;
$$;

DROP FUNCTION IF EXISTS analytics_actions_by_bucket(TEXT, INT, TEXT);

CREATE OR REPLACE FUNCTION analytics_actions_by_bucket(
  p_granularity TEXT DEFAULT 'day',
  p_buckets INT DEFAULT 30,
  p_tz TEXT DEFAULT 'Australia/Melbourne',
  p_offset_buckets INT DEFAULT 0
)
RETURNS TABLE (bucket_start TIMESTAMPTZ, action TEXT, events BIGINT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH actions AS (
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
    a.action,
    COALESCE(g.events, 0)::BIGINT
  FROM analytics_bucket_series(p_granularity, p_buckets, p_tz, p_offset_buckets) AS s(bucket_local)
  CROSS JOIN actions a
  LEFT JOIN agg g
    ON g.bucket_local = s.bucket_local
   AND g.action = a.action
  ORDER BY 1, 2;
$$;

DROP FUNCTION IF EXISTS analytics_dwell_by_bucket(TEXT, INT, TEXT);

CREATE OR REPLACE FUNCTION analytics_dwell_by_bucket(
  p_granularity TEXT DEFAULT 'day',
  p_buckets INT DEFAULT 30,
  p_tz TEXT DEFAULT 'Australia/Melbourne',
  p_offset_buckets INT DEFAULT 0
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
      AND e.occurred_at >= analytics_window_start(p_granularity, p_buckets, p_tz, p_offset_buckets)
      AND e.occurred_at < analytics_window_end(p_granularity, p_tz, p_offset_buckets)
    GROUP BY 1
  )
  SELECT
    (s.bucket_local AT TIME ZONE p_tz)::TIMESTAMPTZ,
    COALESCE(a.avg_ms, 0)::NUMERIC,
    COALESCE(a.samples, 0)::BIGINT
  FROM analytics_bucket_series(p_granularity, p_buckets, p_tz, p_offset_buckets) AS s(bucket_local)
  LEFT JOIN agg a ON a.bucket_local = s.bucket_local
  ORDER BY 1;
$$;

GRANT EXECUTE ON FUNCTION analytics_window_end(TEXT, TEXT, INT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION analytics_viewers_by_bucket(TEXT, INT, TEXT, INT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION analytics_action_counts(TEXT, INT, TEXT, INT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION analytics_actions_by_bucket(TEXT, INT, TEXT, INT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION analytics_dwell_by_bucket(TEXT, INT, TEXT, INT) TO authenticated, service_role;
