-- KPMG and Luxury Escapes, on SmartRecruiters, by explicit consent
-- ====================================================================
-- api.smartrecruiters.com's robots.txt disallows every crawler except
-- LinkedInBot, so the consent check refuses these sources unless the
-- employer approved MMSS reading them. They did: the committee confirmed on
-- 2 Oct 2026 that every allowlisted employer has given its OK. Each row
-- records that as config.consent.
--
-- Checked live 2 Oct 2026 (with and without the consent record):
--   kpmg           KPMGAustralia1, 113 postings, mostly mid-senior and
--                  director; experience_levels keeps 28. 9 to review incl.
--                  the 2027 Graduate Program and the Vacationer (Intern) Program.
--   luxuryescapes  LuxuryEscapes, 20 postings, 17 in AU. "Graduate Program -
--                  Product Designer", Sydney, passes the gates.
--
-- Review-only, tier A. ON CONFLICT DO NOTHING: admins own these rows.

INSERT INTO sources (slug, name, tier, adapter, endpoint, config, frequency, enabled)
VALUES
  ('kpmg', 'KPMG', 'A', 'ats',
   'https://api.smartrecruiters.com/v1/companies/KPMGAustralia1',
   jsonb_build_object('vendor', 'smartrecruiters',
     'experience_levels', jsonb_build_array('entry_level', 'internship', 'associate', 'not_applicable'),
     'consent', jsonb_build_object('type', 'explicit', 'recorded_at', '2026-10-02',
       'note', 'KPMG approved MMSS listing its roles (committee confirmation); api.smartrecruiters.com robots.txt disallows crawlers')),
   'nightly', TRUE),
  ('luxuryescapes', 'Luxury Escapes', 'A', 'ats',
   'https://api.smartrecruiters.com/v1/companies/LuxuryEscapes',
   jsonb_build_object('vendor', 'smartrecruiters',
     'consent', jsonb_build_object('type', 'explicit', 'recorded_at', '2026-10-02',
       'note', 'Luxury Escapes approved MMSS listing its roles (committee confirmation); api.smartrecruiters.com robots.txt disallows crawlers')),
   'nightly', TRUE)
ON CONFLICT (slug) DO NOTHING;
