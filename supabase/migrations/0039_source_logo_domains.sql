-- Company logos for synced jobs: record each source's employer domain
-- ====================================================================
-- From this release a synced job gets jobs.company_logo_url from
-- sources.config.domain (lib/logos.ts builds a Brandfetch Logo API hotlink
-- from it), both when it auto-publishes and when an admin approves it from
-- the review queue. A source without a domain keeps the old behaviour: no
-- logo, so the card shows the company's initials.
--
-- Order doesn't matter: the old worker ignores config.domain, and the new
-- one simply writes no logo for a source that lacks it. Merges into config
-- (vendor, location_facet, consent survive) and is safe to re-run.
--
-- Also backfills the logo on jobs these sources have already published,
-- but only where the job has none -- a logo an admin set by hand wins.

UPDATE sources AS s
SET config = s.config || jsonb_build_object('domain', d.domain),
    updated_at = NOW()
FROM (VALUES
  ('unilever', 'unilever.com'),
  ('ogilvy',   'ogilvy.com'),
  ('mars',     'mars.com'),
  ('pg',       'pg.com')
) AS d(slug, domain)
WHERE s.slug = d.slug;

UPDATE jobs AS j
SET company_logo_url =
  'https://cdn.brandfetch.io/domain/' || (s.config->>'domain')
  || '/w/128/h/128/fallback/lettermark/icon?c=1ido3HOcLqD6CO4-TB5'
FROM sources AS s
WHERE j.source = 'sync:' || s.slug
  AND s.config ? 'domain'
  AND (j.company_logo_url IS NULL OR j.company_logo_url = '');
