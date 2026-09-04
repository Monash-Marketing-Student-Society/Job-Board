-- The public /submit form (unauthenticated employers) now offers the same
-- "paste a URL or upload a file" logo field the admin job form does
-- (components/admin/logo-upload-field.tsx, shared by both). The 0014
-- policy only covers `TO authenticated ... AND is_admin()`, which an
-- anon-key upload from the public form never satisfies.
--
-- This mirrors the trust model job_submissions itself already uses —
-- "Anyone can submit a job" (0004/0013) is an open anon INSERT with no
-- ownership check, because that table is deliberately a public self-serve
-- queue an admin reviews before anything goes live. A submitted logo file
-- is the same shape of risk (bucket already caps it at 2MB, image mime
-- types only — see 0014) and the same review gate applies before the URL
-- it produces ever reaches a live job.
--
-- Deliberately INSERT-only: a public submitter can add a new logo file,
-- not touch one that's already there. UPDATE/DELETE stay admin-only,
-- unchanged from 0014.
CREATE POLICY "Anyone can upload a company logo"
  ON storage.objects
  FOR INSERT
  TO anon
  WITH CHECK (bucket_id = 'company-logos');
