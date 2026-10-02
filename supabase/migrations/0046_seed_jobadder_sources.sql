-- Yo-Chi and Seed Heritage: JobAdder job-board widgets
-- ====================================================================
-- Both embed JobAdder's widget on their careers page; the new `jobadder`
-- vendor (lib/sync/adapters/jobadder.ts) reads the same list and detail
-- fragments the widget loads from apps.jobadder.com/widgets/V1/. That
-- host's robots.txt allows only /widgets/V1/*, and both employers' own
-- careers pages are allowed too, so the consent check passes on robots.
--
-- Each board labels postings with its own classification ids, so each row
-- says which carry location and work type, and `include` keeps only the
-- head-office category -- otherwise every venue or store role would fill
-- the review queue. Verified live 2 Oct 2026:
--   yochi  51 listed -> 5 "Support Team" read (incl. Content Creator,
--          Melbourne -> review)
--   seed   151 listed over 2 pages -> 8 "Support Office" read (incl.
--          Marketing Coordinator, Melbourne)
-- JobAdder carries no closing date, so every posting is held for review.
--
-- Review-only (no auto_publish), tier A. Apply AFTER deploying the worker
-- that knows `jobadder`, or the nightly run fails these rows with
-- "no known vendor". ON CONFLICT DO NOTHING: admins own these rows.

INSERT INTO sources (slug, name, tier, adapter, endpoint, config, frequency, enabled)
VALUES
  ('yochi', 'Yo-Chi', 'A', 'ats', 'https://apps.jobadder.com/widgets/V1/Jobs',
   jsonb_build_object(
     'vendor', 'jobadder',
     'domain', 'yochi.com.au',
     'key', 'AU6_uxaopqd4cg2uxhjrm6zxpyn3tm',
     'page_url', 'https://yochi.com.au/careers/',
     'categories', jsonb_build_object('location', '26694', 'job_type', '26695'),
     'include', jsonb_build_object('category', '26692', 'values', jsonb_build_array('Support Team'))
   ), 'nightly', TRUE),
  ('seed', 'Seed Heritage', 'A', 'ats', 'https://apps.jobadder.com/widgets/V1/Jobs',
   jsonb_build_object(
     'vendor', 'jobadder',
     'domain', 'seedheritage.com',
     'key', 'AU1_cxvuzgzqvk4u7hwfbsuyc52koi',
     'page_url', 'https://www.seedheritage.com/pages/careers',
     'categories', jsonb_build_object('location', '17152', 'job_type', '17153'),
     'include', jsonb_build_object('category', '17150', 'values', jsonb_build_array('Support Office'))
   ), 'nightly', TRUE)
ON CONFLICT (slug) DO NOTHING;
