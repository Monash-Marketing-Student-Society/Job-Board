-- Seven more allowlisted employers, all on Workday
-- ====================================================================
-- From the 2 Oct 2026 survey of all 57 employers in the PRD: these seven
-- run Workday career sites the existing adapter reads. Each site's
-- robots.txt allows crawling (the consent check passes on robots), and each
-- was run live through the pipeline before this was written.
--
--   uniqlo     2 postings  (AU graduates board)
--   nine       29          (all Australian)
--   newscorp   42          (dowjones tenant, News Corp Australia site, all AU)
--   protiviti  24 APAC     location_facet Location_Country = Australia -> 14
--   commbank   164         locationCountry = Australia (113) + title_filter -> 3
--   telstra    222         Location_Country = Australia (213) + title_filter -> 1
--   accenture  2000+       locationCountry = Australia (260) + title_filter -> 14
--
-- `title_filter` (lib/sync/adapters/workday.ts) is for the three employers
-- that hire across every function: branch, retail and IT roles would
-- otherwise fill the review queue. It's checked on the list title, so it
-- also skips their detail requests. Review-only (no auto_publish), tier A.
-- ON CONFLICT DO NOTHING: admins own these rows once they exist.

INSERT INTO sources (slug, name, tier, adapter, endpoint, config, frequency, enabled)
VALUES
  ('uniqlo', 'Uniqlo', 'A', 'ats',
   'https://fastretailing.wd3.myworkdayjobs.com/wday/cxs/fastretailing/graduates_au_Uniqlo',
   jsonb_build_object('vendor', 'workday'), 'nightly', TRUE),
  ('nine', 'Nine', 'A', 'ats',
   'https://nine.wd105.myworkdayjobs.com/wday/cxs/nine/Nine_External_Career_Site',
   jsonb_build_object('vendor', 'workday'), 'nightly', TRUE),
  ('newscorp', 'News Corp Australia', 'A', 'ats',
   'https://dowjones.wd1.myworkdayjobs.com/wday/cxs/dowjones/News_Corp_Australia_Careers',
   jsonb_build_object('vendor', 'workday'), 'nightly', TRUE),
  ('protiviti', 'Protiviti', 'A', 'ats',
   'https://roberthalf.wd1.myworkdayjobs.com/wday/cxs/roberthalf/ProtivitiAPAC',
   jsonb_build_object('vendor', 'workday',
     'location_facet', jsonb_build_object('parameter', 'Location_Country', 'prefix', 'Australia')),
   'nightly', TRUE),
  ('commbank', 'CommBank', 'A', 'ats',
   'https://cba.wd3.myworkdayjobs.com/wday/cxs/cba/CommBank_Careers',
   jsonb_build_object('vendor', 'workday',
     'location_facet', jsonb_build_object('parameter', 'locationCountry', 'prefix', 'Australia'),
     'title_filter', '\b(marketing|marketer|brand|communications?|comms|social|content|digital|media|campaign|public relations|pr|events?|partnerships?|sponsorships?|insights?|creative|copywriter|advertising|e-?commerce|growth|customer experience|cx|graduate|grad|intern(ship)?|cadet|trainee|vacation(er)?)\b'),
   'nightly', TRUE),
  ('telstra', 'Telstra', 'A', 'ats',
   'https://telstra.wd3.myworkdayjobs.com/wday/cxs/telstra/Telstra_Careers',
   jsonb_build_object('vendor', 'workday',
     'location_facet', jsonb_build_object('parameter', 'Location_Country', 'prefix', 'Australia'),
     'title_filter', '\b(marketing|marketer|brand|communications?|comms|social|content|digital|media|campaign|public relations|pr|events?|partnerships?|sponsorships?|insights?|creative|copywriter|advertising|e-?commerce|growth|customer experience|cx|graduate|grad|intern(ship)?|cadet|trainee|vacation(er)?)\b'),
   'nightly', TRUE),
  ('accenture', 'Accenture', 'A', 'ats',
   'https://accenture.wd103.myworkdayjobs.com/wday/cxs/accenture/AccentureCareers',
   jsonb_build_object('vendor', 'workday',
     'location_facet', jsonb_build_object('parameter', 'locationCountry', 'prefix', 'Australia'),
     'title_filter', '\b(marketing|marketer|brand|communications?|comms|social|content|digital|media|campaign|public relations|pr|events?|partnerships?|sponsorships?|insights?|creative|copywriter|advertising|e-?commerce|growth|customer experience|cx|graduate|grad|intern(ship)?|cadet|trainee|vacation(er)?)\b'),
   'nightly', TRUE)
ON CONFLICT (slug) DO NOTHING;
