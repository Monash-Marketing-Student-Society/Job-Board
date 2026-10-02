-- Dentsu, on Workday
-- ====================================================================
-- The 2 Oct survey found Dentsu linking old iCIMS portals (french-/portuguese-
-- dentsuaegisnetwork.icims.com) whose robots.txt blocked us. Those are
-- leftovers: dentsu.com/au/en/careers links Workday,
-- dentsuaegis.wd3.myworkdayjobs.com / DAN_GLOBAL, and that site's robots.txt
-- allows /DAN_GLOBAL/ and publishes a sitemap. Dentsu also gave MMSS its OK
-- (committee confirmation, 2 Oct 2026), though the check doesn't need it.
--
-- Checked live 2 Oct 2026: 859 postings worldwide, locationCountry =
-- Australia keeps 21. Four pass the gates outright -- Account Coordinator,
-- Digital Content Coordinator, Media Coordinator (Sydney and Melbourne) --
-- and five go to review. No title_filter: an agency's roles are mostly in
-- scope.
--
-- Review-only, tier A. ON CONFLICT DO NOTHING: admins own this row.

INSERT INTO sources (slug, name, tier, adapter, endpoint, config, frequency, enabled)
VALUES (
  'dentsu', 'Dentsu', 'A', 'ats',
  'https://dentsuaegis.wd3.myworkdayjobs.com/wday/cxs/dentsuaegis/DAN_GLOBAL',
  jsonb_build_object('vendor', 'workday',
    'location_facet', jsonb_build_object('parameter', 'locationCountry', 'prefix', 'Australia')),
  'nightly', TRUE
)
ON CONFLICT (slug) DO NOTHING;
