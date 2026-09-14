-- Backfills the same tag drift 0018_enforce_tag_vocabulary.sql fixed on
-- `jobs` and `job_submissions`, onto `analytics_events` -- found in code
-- review of #59.
--
-- analytics_events.tags is a denormalised snapshot, copied from jobs.tags by
-- the trigger in 0006_analytics_events.sql at the moment each event row is
-- inserted. 0018 rewrote jobs.tags going forward, but a snapshot already
-- taken is not retroactively updated by changing the row it was copied
-- from -- every event row logged before 0018 kept whatever pre-backfill
-- free-text tags were live on its job at the time. Left alone, the admin
-- analytics tag chart (lib/analytics/queries.ts) would show old and new
-- spellings of the same category as separate bars forever, with no way to
-- reconcile historical data against itself.
--
-- Numbered 0020, not 0019 -- 0019 is reserved by the rate-limit race-fix
-- migration on a separate open branch/PR at the time this was written.
--
-- Uses the identical mapping 0018 used (26 distinct legacy strings -> the
-- twelve-value JOB_FUNCTIONS vocabulary, "Marketing" dropped rather than
-- remapped) since this is the same tag universe by construction: every
-- value that has ever been in analytics_events.tags came from jobs.tags via
-- the same trigger. No CHECK constraint is added here, unlike jobs and
-- job_submissions -- analytics_events is never written by anything but that
-- trigger, which already only ever copies from a jobs row already
-- constrained by jobs_tags_vocabulary_chk.
CREATE TEMP TABLE analytics_tag_backfill_map (old_tag TEXT PRIMARY KEY, new_tag TEXT NOT NULL) ON COMMIT DROP;

INSERT INTO analytics_tag_backfill_map (old_tag, new_tag) VALUES
  ('Strategy', 'Strategy'),
  ('Sales', 'Sales'),
  ('Communications', 'Communications'),
  ('strategy', 'Strategy'),
  ('Strategy / Consulting', 'Strategy'),
  ('Strategy/ Consulting', 'Strategy'),
  ('Strategy/consulting', 'Strategy'),
  ('communications', 'Communications'),
  ('Communication', 'Communications'),
  ('Digital marketing', 'Digital'),
  ('Digital Marketing', 'Digital'),
  ('Brand Marketing', 'Brand'),
  ('Product Marketing', 'Brand'),
  ('Market Research', 'Analytics'),
  ('Data Analytics', 'Analytics'),
  ('Content & Creative', 'Creative'),
  ('Public Relations', 'Communications'),
  ('Activations', 'Events'),
  ('Supply Chain & Operations', 'Operations'),
  ('Operations', 'Operations'),
  ('operations', 'Operations'),
  ('Procurement', 'Operations'),
  ('Logistics', 'Operations'),
  ('Product', 'Product'),
  ('Management', 'Management');
  -- 'Marketing' absent on purpose, same as 0018 -- dropped, not remapped.

UPDATE analytics_events
SET tags = (
  SELECT ARRAY_AGG(DISTINCT m.new_tag)
  FROM unnest(analytics_events.tags) AS old_tag(value)
  JOIN analytics_tag_backfill_map m ON m.old_tag = old_tag.value
)
WHERE analytics_events.tags IS NOT NULL;
