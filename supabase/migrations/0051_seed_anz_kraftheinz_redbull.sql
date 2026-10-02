-- ANZ, Kraft Heinz and Red Bull, all read with the sitemap adapter
-- ====================================================================
-- Three employers whose careers pages hide their job system behind scripts,
-- found on 3 Oct 2026. Each publishes a job sitemap whose pages carry
-- schema.org JobPosting data, so no new adapter is needed. All three
-- robots.txt files allow the job paths (and every allowlisted employer has
-- also given MMSS its OK).
--
--   anz         careers.anz.com -- the same SuccessFactors platform as
--               Deloitte: /job/ pages with microdata, location in
--               streetAddress. 246 postings, url_filter keeps 7. The 2028 AU
--               Graduate Program passes the gates; the 2027/28 AU Summer
--               Intern program goes to review.
--   kraftheinz  jobs.kraftheinz.com (Eightfold; its API refuses us, the
--               careers pages don't). /careers/sitemap.xml, 802 postings
--               worldwide; slugs carry title, city and country, so one
--               url_filter requires both an Australian place and a
--               marketing-type word: 2 kept (Consumer Insights Manager,
--               Sensory Specialist).
--   redbull     jobs.redbull.com, no robots restrictions. postings_path
--               /au-en/ alone keeps the 14 Australian roles, incl. Student
--               Marketeer at Monash, Melbourne and La Trobe universities.
--
-- Review-only, tier A. ON CONFLICT DO NOTHING: admins own these rows.

INSERT INTO sources (slug, name, tier, adapter, endpoint, config, frequency, enabled)
VALUES
  ('anz', 'ANZ', 'A', 'listing',
   'https://careers.anz.com/sitemap.xml',
   jsonb_build_object('vendor', 'sitemap_jsonld',
     'postings_path', '/job/',
     'url_filter', 'marketing|graduate|\bintern(ship)?s?\b|brand|content|social|digital|communicat|copywrit|creative|campaign|entry-level|e-?commerce|\bcadet|trainee|\bcrm\b|\bmedia\b|public-relations|\bevents?\b|vacation'),
   'nightly', TRUE),
  ('kraftheinz', 'Kraft Heinz', 'A', 'listing',
   'https://jobs.kraftheinz.com/careers/sitemap.xml',
   jsonb_build_object('vendor', 'sitemap_jsonld',
     'postings_path', '/careers/job/',
     'url_filter', '(?=.*(australia|melbourne|sydney))(?=.*(marketing|graduate|intern|brand|content|social|digital|communicat|copywrit|creative|campaign|entry-level|e-?commerce|cadet|trainee|crm|media|insight|events?|vacation))'),
   'nightly', TRUE),
  ('redbull', 'Red Bull', 'A', 'listing',
   'https://jobs.redbull.com/sitemap.xml',
   jsonb_build_object('vendor', 'sitemap_jsonld', 'postings_path', '/au-en/'),
   'nightly', TRUE)
ON CONFLICT (slug) DO NOTHING;
