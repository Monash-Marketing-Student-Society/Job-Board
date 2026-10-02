-- Nestlé and Capgemini, read with the sitemap adapter
-- ====================================================================
-- Both run SuccessFactors career sites like Deloitte and ANZ: a /sitemap.xml
-- of /job/ pages carrying schema.org JobPosting data, and a robots.txt that
-- allows /job/. Both are global boards, so a url_filter with two lookaheads
-- keeps only Australian, marketing-type postings (as Kraft Heinz in 0051).
-- Found 3 Oct 2026; every allowlisted employer has also given MMSS its OK.
--
--   nestle     jobdetails.nestle.com, 2,108 postings worldwide. Australian
--              slugs end in "-<STATE>-<postcode>/" (61 today, mostly
--              boutique and merchandising roles); one passes the filter,
--              Assistant Brand Manager in Rhodes, Sydney.
--   capgemini  careers.capgemini.com, 6,372 postings worldwide. Australian
--              slugs start with the city (78 today, mostly SAP and IT); the
--              filter keeps 2: the Graduate program (passes the gates) and
--              a digital customer experience role (to review).
--
-- Review-only, tier A. ON CONFLICT DO NOTHING: admins own these rows.

INSERT INTO sources (slug, name, tier, adapter, endpoint, config, frequency, enabled)
VALUES
  ('nestle', 'Nestlé', 'A', 'listing',
   'https://jobdetails.nestle.com/sitemap.xml',
   jsonb_build_object('vendor', 'sitemap_jsonld',
     'postings_path', '/job/',
     'url_filter', '(?=.*-(vic|nsw|qld|wa|sa|act|tas|nt)-\d{4}/)(?=.*(marketing|graduate|intern|brand|content|social|digital|communicat|copywrit|creative|campaign|entry-level|e-?commerce|cadet|trainee|crm|media|insight|events?|vacation))'),
   'nightly', TRUE),
  ('capgemini', 'Capgemini', 'A', 'listing',
   'https://careers.capgemini.com/sitemap.xml',
   jsonb_build_object('vendor', 'sitemap_jsonld',
     'postings_path', '/job/',
     'url_filter', '(?=/job/(melbourne|sydney|brisbane|perth|adelaide|canberra|hobart|darwin|australia)\b)(?=.*(marketing|graduate|intern|brand|content|social|digital|communicat|copywrit|creative|campaign|entry-level|e-?commerce|cadet|trainee|crm|media|insight|events?|vacation))'),
   'nightly', TRUE)
ON CONFLICT (slug) DO NOTHING;
