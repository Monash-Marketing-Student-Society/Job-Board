-- AFL, read with the sitemap adapter
-- ====================================================================
-- careers.afl is a SuccessFactors career site like Deloitte, ANZ, Nestlé
-- and Capgemini: /sitemap.xml lists /job/ pages carrying JobPosting data,
-- and robots.txt allows /job/. Checked live 3 Oct 2026: 11 postings, all in
-- Australia, so no url_filter -- the gates sort them. 2 pass (both
-- coordinator roles), 2 go to review, 7 are rejected (manager and head-of
-- roles). Closing dates are read.
--
-- Review-only, tier A. ON CONFLICT DO NOTHING: admins own these rows.

INSERT INTO sources (slug, name, tier, adapter, endpoint, config, frequency, enabled)
VALUES
  ('afl', 'AFL', 'A', 'listing',
   'https://careers.afl/sitemap.xml',
   jsonb_build_object('vendor', 'sitemap_jsonld', 'postings_path', '/job/'),
   'nightly', TRUE)
ON CONFLICT (slug) DO NOTHING;
