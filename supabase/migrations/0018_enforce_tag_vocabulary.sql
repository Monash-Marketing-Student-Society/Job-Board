-- Tag backfill + CHECK constraint. Membership in JOB_FUNCTIONS
-- (lib/tags.ts) has been enforced in app code since #31-#38, but never in
-- the database — every write path canonicalises through toJobFunctions()
-- before this migration, but rows written before that (or by anything that
-- bypassed it, e.g. the old external job sync) were never touched.
--
-- The drift query behind this migration
--   SELECT tag, COUNT(*) FROM jobs, unnest(tags) AS tag GROUP BY tag ORDER BY 2 DESC;
-- found 62 `jobs` rows (51 with tags), 133 tag instances across 26 distinct
-- strings — only 3 of which exactly matched the then-nine-value vocabulary.
-- `job_submissions` had zero rows with tags: no drift, no backfill needed
-- there, only the constraint.
--
-- Order matters and is enforced by running in one transaction (the default
-- for a Supabase migration file): backfill first, so every row is already
-- vocabulary-compliant by the time the CHECK is added, or the ALTER TABLE
-- below fails against the very rows it is meant to protect going forward.
--
-- The mapping is a product decision, not a mechanical one — see the review
-- in the audit follow-through conversation for the reasoning behind each
-- row. Three tags absent from the pre-existing nine-value vocabulary
-- (Operations, Product, Management) were added to lib/tags.ts and to the
-- CHECK list below in the same change, to hold the legacy categories that
-- had no honest fit in the original nine. One legacy tag — "Marketing" — is
-- deliberately absent from the map: every value in this vocabulary already
-- names a marketing function, so a tag that just says "Marketing" carries
-- no information a tenth catch-all value would have added. Those 7
-- instances are dropped, not remapped; the job keeps every other tag it had.
--
-- This only constrains array *membership* — the count cap (MAX_JOB_FUNCTIONS
-- in lib/tags.ts) stays a product rule enforced in app code, not a schema
-- rule, per that constant's own comment: a change of tag limit should not
-- require a migration or fail an insert against something already stored.

CREATE TEMP TABLE tag_backfill_map (old_tag TEXT PRIMARY KEY, new_tag TEXT NOT NULL) ON COMMIT DROP;

INSERT INTO tag_backfill_map (old_tag, new_tag) VALUES
  -- exact matches, carried through unchanged
  ('Strategy', 'Strategy'),
  ('Sales', 'Sales'),
  ('Communications', 'Communications'),
  -- case / spacing variants folding onto an existing value
  ('strategy', 'Strategy'),
  ('Strategy / Consulting', 'Strategy'),
  ('Strategy/ Consulting', 'Strategy'),
  ('Strategy/consulting', 'Strategy'),
  ('communications', 'Communications'),
  ('Communication', 'Communications'),
  ('Digital marketing', 'Digital'),
  -- Digital: "Digital Marketing Intern" is Digital's own example title
  ('Digital Marketing', 'Digital'),
  -- Brand: "product launches" is explicit in Brand's own definition
  ('Brand Marketing', 'Brand'),
  ('Product Marketing', 'Brand'),
  -- Analytics: "consumer research... market analysis" is Analytics' own wording
  ('Market Research', 'Analytics'),
  ('Data Analytics', 'Analytics'),
  -- Creative: "produces the assets"
  ('Content & Creative', 'Creative'),
  -- Communications: PR is explicit in Communications' own definition
  ('Public Relations', 'Communications'),
  -- Events: "activations" is explicit in Events' own definition
  ('Activations', 'Events'),
  -- new: Operations absorbs the supply-chain/logistics/procurement cluster
  ('Supply Chain & Operations', 'Operations'),
  ('Operations', 'Operations'),
  ('operations', 'Operations'),
  ('Procurement', 'Operations'),
  ('Logistics', 'Operations'),
  -- new: Product
  ('Product', 'Product'),
  -- new: Management
  ('Management', 'Management');
  -- 'Marketing' has no row here on purpose — see the note above. Any tag not
  -- in this map is dropped by the INNER JOIN in the UPDATE below.

-- Re-map every tag in place. The correlated subquery re-derives the array
-- per row: unmapped entries (only "Marketing", currently) are dropped by the
-- JOIN; ARRAY_AGG(DISTINCT ...) also folds duplicates that the mapping
-- itself introduces (e.g. a job tagged both "Strategy / Consulting" and
-- "strategy" collapses to one "Strategy"). A row whose every tag was
-- unmapped ends up with tags = NULL, which the schema already allows.
UPDATE jobs
SET tags = (
  SELECT ARRAY_AGG(DISTINCT m.new_tag)
  FROM unnest(jobs.tags) AS old_tag(value)
  JOIN tag_backfill_map m ON m.old_tag = old_tag.value
)
WHERE jobs.tags IS NOT NULL;

-- No drift was found here, but running the same backfill costs nothing and
-- means this migration is correct even if a tagged submission landed between
-- the drift query and this running.
UPDATE job_submissions
SET tags = (
  SELECT ARRAY_AGG(DISTINCT m.new_tag)
  FROM unnest(job_submissions.tags) AS old_tag(value)
  JOIN tag_backfill_map m ON m.old_tag = old_tag.value
)
WHERE job_submissions.tags IS NOT NULL;

-- Membership only, per lib/tags.ts JOB_FUNCTIONS — keep this list in sync
-- with that array by hand; nothing derives one from the other.
ALTER TABLE jobs
  ADD CONSTRAINT jobs_tags_vocabulary_chk
  CHECK (tags IS NULL OR tags <@ ARRAY[
    'Strategy', 'Sales', 'Creative', 'Events', 'Communications', 'Analytics',
    'Social Media', 'Digital', 'Brand', 'Operations', 'Product', 'Management'
  ]::text[]);

ALTER TABLE job_submissions
  ADD CONSTRAINT job_submissions_tags_vocabulary_chk
  CHECK (tags IS NULL OR tags <@ ARRAY[
    'Strategy', 'Sales', 'Creative', 'Events', 'Communications', 'Analytics',
    'Social Media', 'Digital', 'Brand', 'Operations', 'Product', 'Management'
  ]::text[]);
