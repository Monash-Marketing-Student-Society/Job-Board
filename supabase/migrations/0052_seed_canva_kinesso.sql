-- Canva (SmartRecruiters) and Kinesso (IPG Mediabrands' Greenhouse board)
-- ====================================================================
-- Two allowlisted employers identified on 3 Oct 2026.
--
--   canva    SmartRecruiters company "Canva". api.smartrecruiters.com's
--            robots.txt disallows crawlers, so the row carries the explicit
--            consent the committee confirmed on 2 Oct 2026 (as KPMG and
--            Luxury Escapes in 0049). experience_levels keeps 15 postings;
--            2 go to review (Sydney account executive roles).
--   kinesso  Kinesso posts through IPG Mediabrands' global Greenhouse board
--            "mediabrands" (216 postings worldwide). config.location_filter
--            keeps only Australian locations: 2 today, both Melbourne
--            Performance Manager roles, which the level gate rejects. The
--            row is here for the graduate and intern roles when they open.
--
-- Review-only, tier A. ON CONFLICT DO NOTHING: admins own these rows.

INSERT INTO sources (slug, name, tier, adapter, endpoint, config, frequency, enabled)
VALUES
  ('canva', 'Canva', 'A', 'ats',
   'https://api.smartrecruiters.com/v1/companies/Canva',
   jsonb_build_object('vendor', 'smartrecruiters',
     'experience_levels', jsonb_build_array('entry_level', 'internship', 'associate', 'not_applicable'),
     'consent', jsonb_build_object('type', 'explicit', 'recorded_at', '2026-10-02',
       'note', 'Canva approved MMSS listing its roles (committee confirmation); api.smartrecruiters.com robots.txt disallows crawlers')),
   'nightly', TRUE),
  ('kinesso', 'Kinesso (IPG Mediabrands)', 'A', 'ats',
   'https://boards-api.greenhouse.io/v1/boards/mediabrands',
   jsonb_build_object('vendor', 'greenhouse', 'location_filter', 'australia'),
   'nightly', TRUE)
ON CONFLICT (slug) DO NOTHING;
