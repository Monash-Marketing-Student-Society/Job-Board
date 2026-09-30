-- Mars and P&G: Phenom career sites over Workday, read through Workday
-- ====================================================================
-- Both list on Phenom (careers.mars.com, pgcareers.com), but every Phenom
-- posting's apply URL points into a Workday tenant, and Workday's own API
-- carries what Phenom's search results don't: the full description and,
-- for Mars, the closing date. So these are Workday sources, not Phenom ones.
--
-- Both tenants are global (~800 postings each), so each row sets
-- `config.location_facet` and the adapter asks Workday for Australian
-- postings only. Verified live 30 Sep 2026:
--   P&G   locationCountry = Australia  ->  5 listed (4 fetched), 1 to review
--   Mars  locations AUS-*              -> 12 listed, 3 Melbourne jobs to review
--
-- Review-only, like 0034/0035: no `auto_publish` in config.
-- ON CONFLICT DO NOTHING so a re-run never undoes an admin's pause/demotion.

INSERT INTO sources (slug, name, tier, adapter, endpoint, config, frequency, enabled)
VALUES
  (
    'mars',
    'Mars',
    'A',
    'ats',
    'https://mars.wd3.myworkdayjobs.com/wday/cxs/mars/External',
    '{"vendor": "workday", "location_facet": {"parameter": "locations", "prefix": "AUS-"}}'::jsonb,
    'nightly',
    TRUE
  ),
  (
    'pg',
    'P&G',
    'A',
    'ats',
    'https://pg.wd5.myworkdayjobs.com/wday/cxs/pg/1000',
    '{"vendor": "workday", "location_facet": {"parameter": "locationCountry", "prefix": "Australia"}}'::jsonb,
    'nightly',
    TRUE
  )
ON CONFLICT (slug) DO NOTHING;
