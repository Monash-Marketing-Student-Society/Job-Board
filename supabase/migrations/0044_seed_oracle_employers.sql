-- Penfolds (TWE) and Ipsos, on Oracle Recruiting Cloud
-- ====================================================================
-- Both run Oracle "Candidate Experience" careers sites, read by the new
-- `oracle` adapter (lib/sync/adapters/oracle.ts) from the same requests the
-- sites make themselves. Neither host serves a robots.txt, so the consent
-- check finds no restriction. Verified live 2 Oct 2026:
--
--   penfolds  ebpm.fa.us2 / CX_1     64 listed, 19 in AU -> 2 to review
--             (incl. Customer Marketing Executive, Melbourne)
--   ipsos     ecqf.fa.em2 / CX_2001  173 listed, 4 in AU -> 1 to review
--
-- Ipsos Australia is on Oracle, not Pinpoint as the PRD noted
-- (ipsos.pinpointhq.com is Ipsos UK). Both tenants are global; the adapter
-- keeps PrimaryLocationCountry = AU (config.country defaults to AU).
-- Review-only, tier A. ON CONFLICT DO NOTHING: admins own these rows.

INSERT INTO sources (slug, name, tier, adapter, endpoint, config, frequency, enabled)
VALUES
  ('penfolds', 'Penfolds (TWE)', 'A', 'ats',
   'https://ebpm.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1',
   jsonb_build_object('vendor', 'oracle'), 'nightly', TRUE),
  ('ipsos', 'Ipsos', 'A', 'ats',
   'https://ecqf.fa.em2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_2001',
   jsonb_build_object('vendor', 'oracle'), 'nightly', TRUE)
ON CONFLICT (slug) DO NOTHING;
