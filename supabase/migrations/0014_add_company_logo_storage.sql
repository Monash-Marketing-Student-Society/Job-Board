-- Storage bucket for uploaded company logos (admin job form: "Upload a
-- PNG" next to the existing Company Logo URL text field, which stays as
-- the way to point at an externally-hosted logo). Public so logos render
-- on public job cards via a plain public URL, same as jobs.company_logo_url
-- already assumes for external URLs — no signed-URL round-trip needed.
--
-- storage.objects/storage.buckets already carry full anon/authenticated/
-- service_role table grants out of the box (unlike the app's own tables —
-- see 0013's note), so RLS below is the only gate that matters here.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'company-logos',
  'company-logos',
  TRUE,
  2097152, -- 2MB
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
);

-- Public bucket already serves GETs unauthenticated via the platform's
-- /storage/v1/object/public/ path, but an explicit SELECT policy is still
-- needed for RLS-gated access (e.g. the dashboard, listing objects).
CREATE POLICY "Anyone can view company logos"
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'company-logos');

-- Only admins can upload/replace/remove logos — same is_admin() gate the
-- jobs table CRUD policies use.
CREATE POLICY "Admins can upload company logos"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'company-logos' AND is_admin());

CREATE POLICY "Admins can update company logos"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'company-logos' AND is_admin())
  WITH CHECK (bucket_id = 'company-logos' AND is_admin());

CREATE POLICY "Admins can delete company logos"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'company-logos' AND is_admin());
