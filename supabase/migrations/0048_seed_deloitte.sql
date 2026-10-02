-- Deloitte, read from its public SuccessFactors careers site
-- ====================================================================
-- The PRD marked Deloitte "partner-only" because SuccessFactors' API needs
-- credentials. Its public careers site, jobs.deloitte.com.au, doesn't:
-- robots.txt allows /job/ (it blocks apply, talent-community and service
-- paths only), /sitemap.xml lists every posting, and each posting page
-- carries schema.org JobPosting as *microdata*, which the sitemap adapter
-- now reads (lib/sync/adapters/sitemap-jsonld.ts jobPostingFromMicrodata).
--
-- Checked live 2 Oct 2026: 246 postings; url_filter keeps 17 (under the
-- 50-page cap); "Events & Marketing Coordinator", Sydney, passes the gates
-- and "GPS Campaign Producer" goes to review. No closing date or job type
-- on Deloitte's pages, so every job is held for review.
--
-- Review-only, tier A. ON CONFLICT DO NOTHING: admins own this row.

INSERT INTO sources (slug, name, tier, adapter, endpoint, config, frequency, enabled)
VALUES (
  'deloitte', 'Deloitte', 'A', 'listing',
  'https://jobs.deloitte.com.au/sitemap.xml',
  jsonb_build_object('vendor', 'sitemap_jsonld',
    'postings_path', '/job/',
    'url_filter', 'marketing|graduate|\bintern(ship)?s?\b|brand|content|social|digital|communicat|copywrit|creative|campaign|entry-level|e-?commerce|\bcadet|trainee|\bcrm\b|\bmedia\b|public-relations|\bevents?\b|vacation'),
  'nightly', TRUE
)
ON CONFLICT (slug) DO NOTHING;
