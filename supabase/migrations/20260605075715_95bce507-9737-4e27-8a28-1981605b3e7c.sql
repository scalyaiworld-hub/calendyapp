
-- Tighten anon column grants to only the minimum safe set per scanner expectations

-- businesses
REVOKE SELECT ON public.businesses FROM anon;
GRANT SELECT (id, name, slug, timezone, logo_url, industry, brand_primary, brand_background, brand_font) ON public.businesses TO anon;

-- locations
REVOKE SELECT ON public.locations FROM anon;
GRANT SELECT (id, business_id, name, address, is_active) ON public.locations TO anon;

-- professionals
REVOKE SELECT ON public.professionals FROM anon;
GRANT SELECT (id, business_id, name, avatar_url, is_active) ON public.professionals TO anon;

-- appointments
REVOKE SELECT ON public.appointments FROM anon;
GRANT SELECT (id, business_id, service_id, professional_id, location_id, starts_at, ends_at, status) ON public.appointments TO anon;

-- audit_log: remove NULL business_id loophole
DROP POLICY IF EXISTS "Owners read audit" ON public.audit_log;
CREATE POLICY "Owners read audit"
  ON public.audit_log
  FOR SELECT
  TO authenticated
  USING (business_id IS NOT NULL AND is_business_owner(business_id));
