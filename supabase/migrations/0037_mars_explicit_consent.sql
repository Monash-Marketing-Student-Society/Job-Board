-- Mars: record the employer's explicit consent on its source
-- ====================================================================
-- From this release, every source passes a consent check before it is read
-- (lib/sync/robots.ts): the employer's career-site robots.txt must allow
-- the site, or the source must carry `config.consent.type = 'explicit'`.
--
-- Mars's Workday robots.txt says `Disallow: /External/` -- the site this
-- source reads -- but Mars gave MMSS explicit approval (confirmed by the
-- committee on 2 Oct 2026). This records it, so the check passes.
--
-- Apply BEFORE deploying the worker that contains the check, or Mars's next
-- run fails with "robots.txt ... disallows /External/". Merges into config
-- (vendor and location_facet survive) and is safe to re-run.

UPDATE sources
SET config = config || jsonb_build_object(
      'consent', jsonb_build_object(
        'type', 'explicit',
        'recorded_at', '2026-10-02',
        'note', 'Mars approved MMSS listing its roles; its robots.txt disallows /External/'
      )
    ),
    updated_at = NOW()
WHERE slug = 'mars';
