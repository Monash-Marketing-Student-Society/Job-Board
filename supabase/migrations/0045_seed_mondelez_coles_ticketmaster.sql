-- Mondelēz, Ticketmaster and Coles
-- ====================================================================
-- No new adapters: each runs on a job system the sync already reads.
-- Checked live 2 Oct 2026, consent check included:
--
--   mondelez      Workday on Workday's other domain (wd3.myworkdaysite.com,
--                 tenant mdlz, site External) behind its Phenom careers site.
--                 1,267 listed, 24 in Australia, all Cadbury retail and
--                 factory roles today -> title_filter keeps none of them.
--                 robots.txt answers HTTP 422 (no robots file: no restriction).
--   ticketmaster  Workday livenation.wd503 / TMExternalSite, 4 in Australia.
--                 "Marketing Associate - Music", Melbourne, passes outright.
--                 robots.txt allows /TMExternalSite/.
--   coles         Phenom site with no job system underneath: each job page
--                 is the application page and carries JobPosting JSON-LD.
--                 Read with the sitemap + JSON-LD adapter through
--                 sitemap_index.xml (633 job URLs across two child
--                 sitemaps); url_filter leaves 4, incl. "Events and
--                 Sponsorships Coordinator" (passes). robots.txt allows
--                 /au/en/job/ (it blocks */apply and tracking only).
--
-- Review-only, tier A. ON CONFLICT DO NOTHING: admins own these rows.

INSERT INTO sources (slug, name, tier, adapter, endpoint, config, frequency, enabled)
VALUES
  ('mondelez', 'Mondelēz', 'A', 'ats',
   'https://wd3.myworkdaysite.com/wday/cxs/mdlz/External',
   jsonb_build_object('vendor', 'workday',
     'location_facet', jsonb_build_object('parameter', 'locationCountry', 'prefix', 'Australia'),
     'title_filter', '\b(marketing|marketer|brand|communications?|comms|social|content|digital|media|campaign|public relations|pr|events?|partnerships?|sponsorships?|insights?|creative|copywriter|advertising|e-?commerce|growth|customer experience|cx|graduate|grad|intern(ship)?|cadet|trainee|vacation(er)?)\b'),
   'nightly', TRUE),
  ('ticketmaster', 'Ticketmaster', 'A', 'ats',
   'https://livenation.wd503.myworkdayjobs.com/wday/cxs/livenation/TMExternalSite',
   jsonb_build_object('vendor', 'workday',
     'location_facet', jsonb_build_object('parameter', 'Location_Country', 'prefix', 'Australia')),
   'nightly', TRUE),
  ('coles', 'Coles Group', 'A', 'listing',
   'https://colescareers.com.au/au/en/sitemap_index.xml',
   jsonb_build_object('vendor', 'sitemap_jsonld',
     'postings_path', '/au/en/job/',
     'url_filter', 'marketing|graduate|\bintern(ship)?s?\b|brand|content|social|digital|communicat|copywrit|creative|campaign|entry-level|e-?commerce|\bcadet|trainee|\bcrm\b|\bmedia\b|public-relations|\bevents?\b'),
   'nightly', TRUE)
ON CONFLICT (slug) DO NOTHING;
