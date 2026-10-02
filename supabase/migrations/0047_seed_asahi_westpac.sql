-- Asahi (PageUp) and Westpac (Oracle Recruiting Cloud)
-- ====================================================================
-- Both found on 2 Oct 2026 by probing the employers whose careers pages hide
-- their job system behind JavaScript. Checked live, consent check included:
--
--   asahi    PageUp client 527. The public job RSS feed
--            (careers.pageuppeople.com/527/cw/en/rss) carries every job with
--            description, closing date, location and work type in one
--            request. robots.txt allows /527/cw/. 43 jobs, 6 to review
--            (incl. Social Specialist, Melbourne).
--   westpac  Oracle careers site ebuu.fa.ap1 / CX, no robots.txt. 127 jobs,
--            nearly all lending and banking, so title_filter (now supported
--            by the Oracle adapter) keeps 4, none in scope today.
--
-- Review-only, tier A. ON CONFLICT DO NOTHING: admins own these rows.

INSERT INTO sources (slug, name, tier, adapter, endpoint, config, frequency, enabled)
VALUES
  ('asahi', 'Asahi', 'A', 'ats',
   'https://careers.pageuppeople.com/527/cw/en/rss',
   jsonb_build_object('vendor', 'pageup'), 'nightly', TRUE),
  ('westpac', 'Westpac', 'A', 'ats',
   'https://ebuu.fa.ap1.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX',
   jsonb_build_object('vendor', 'oracle',
     'title_filter', '\b(marketing|marketer|brand|communications?|comms|social|content|digital|media|campaign|public relations|pr|events?|partnerships?|sponsorships?|insights?|creative|copywriter|advertising|e-?commerce|growth|customer experience|cx|graduate|grad|intern(ship)?|cadet|trainee|vacation(er)?)\b'),
   'nightly', TRUE)
ON CONFLICT (slug) DO NOTHING;
