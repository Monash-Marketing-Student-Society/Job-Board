-- Myer and David Jones: careers sites read through sitemap + JSON-LD
-- ====================================================================
-- Both run the same careers platform: no JSON API, but /sitemap.xml lists
-- every posting and each posting page carries schema.org JobPosting JSON-LD
-- (lib/sync/adapters/sitemap-jsonld.ts). Both sites' robots.txt say
-- `Disallow: /`, and both employers gave MMSS explicit approval (confirmed
-- by the user on 2 Oct 2026), so each row carries config.consent like
-- Mars's (0037). Without it the pre-run check refuses the source.
--
-- `url_filter` is checked against each sitemap URL before its page is
-- fetched (the slug carries the title), so the worker reads only possible
-- marketing or entry-level roles, not all ~360 Myer store and warehouse
-- postings. Short keywords are word-bounded: a bare "event" matched
-- "loss-prevention".
--
-- Verified live 2 Oct 2026 with this filter:
--   Myer         361 in sitemap -> 2 read (entry-level buying and planning
--                expressions of interest, "Various Locations") -> review
--   David Jones  58 in sitemap -> 9 read on the first run (1 pass, 3 unsure,
--                5 reject); later runs got an empty 202 from an AWS WAF
--                challenge on every page, which the adapter records as a
--                failed run rather than a quiet zero.
--
-- Review-only, like 0034-0036: no `auto_publish` in config.
-- Apply AFTER deploying the worker that knows `sitemap_jsonld`, or the
-- nightly run fails these rows with "no known vendor".
-- ON CONFLICT DO NOTHING so a re-run never undoes an admin's pause/demotion.

INSERT INTO sources (slug, name, tier, adapter, endpoint, config, frequency, enabled)
VALUES
  (
    'myer',
    'Myer',
    'A',
    'listing',
    'https://careers.myergroup.com.au/sitemap.xml',
    jsonb_build_object(
      'vendor', 'sitemap_jsonld',
      'domain', 'myer.com.au',
      'url_filter', 'marketing|graduate|\bintern(ship)?s?\b|brand|content|social|digital|communicat|copywrit|creative|campaign|entry-level|e-?commerce|\bcadet|trainee|\bcrm\b|\bmedia\b|public-relations|\bevents?\b',
      'consent', jsonb_build_object(
        'type', 'explicit',
        'recorded_at', '2026-10-02',
        'note', 'Myer approved MMSS listing its roles; its robots.txt disallows /'
      )
    ),
    'nightly',
    TRUE
  ),
  (
    'davidjones',
    'David Jones',
    'A',
    'listing',
    'https://careers.davidjones.com.au/sitemap.xml',
    jsonb_build_object(
      'vendor', 'sitemap_jsonld',
      'domain', 'davidjones.com',
      'url_filter', 'marketing|graduate|\bintern(ship)?s?\b|brand|content|social|digital|communicat|copywrit|creative|campaign|entry-level|e-?commerce|\bcadet|trainee|\bcrm\b|\bmedia\b|public-relations|\bevents?\b',
      'consent', jsonb_build_object(
        'type', 'explicit',
        'recorded_at', '2026-10-02',
        'note', 'David Jones approved MMSS listing its roles; its robots.txt disallows /'
      )
    ),
    'nightly',
    TRUE
  )
ON CONFLICT (slug) DO NOTHING;
