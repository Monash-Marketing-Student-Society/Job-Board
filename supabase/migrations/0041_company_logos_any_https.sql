-- Approved company logos: allow any https image, not only Brandfetch
-- ====================================================================
-- 0040 limited company_logos.logo_url to cdn.brandfetch.io. Some employers
-- have no usable Brandfetch logo, so /admin/logos now also accepts a direct
-- image link (a long-lived LinkedIn or Google Play logo) or a file uploaded
-- to the company-logos bucket. lib/logos.ts parseLogoInput() is the real
-- gate -- it refuses page URLs and signed links expiring within 30 days --
-- and this constraint keeps the floor: https only.
--
-- Drops 0040's check by looking it up rather than by name, so it works
-- whatever Postgres called it. Safe to re-run.

DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.company_logos'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%logo_url%'
  LOOP
    EXECUTE format('ALTER TABLE company_logos DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE company_logos
  ADD CONSTRAINT company_logos_logo_url_https CHECK (logo_url LIKE 'https://%');
