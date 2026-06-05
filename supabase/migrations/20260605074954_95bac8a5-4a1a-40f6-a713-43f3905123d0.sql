
-- 1. businesses: revoke sensitive columns from anon
REVOKE SELECT ON public.businesses FROM anon;
GRANT SELECT (id, name, slug, timezone, logo_url, industry, brand_primary, brand_background, brand_font, deleted_at, onboarding_completed, created_at, updated_at) ON public.businesses TO anon;

-- 2. appointments: revoke sensitive columns from anon
REVOKE SELECT ON public.appointments FROM anon;
GRANT SELECT (id, business_id, service_id, professional_id, location_id, starts_at, ends_at, status, source, created_at, updated_at) ON public.appointments TO anon;

-- 3. locations: revoke phone columns from anon
REVOKE SELECT ON public.locations FROM anon;
GRANT SELECT (id, business_id, name, address, is_active, deleted_at, created_at, updated_at) ON public.locations TO anon;

-- 4. professionals: revoke phone columns from anon
REVOKE SELECT ON public.professionals FROM anon;
GRANT SELECT (id, business_id, name, avatar_url, is_active, deleted_at, created_at, updated_at) ON public.professionals TO anon;

-- 5. availability_rules: scope to non-deleted businesses
DROP POLICY IF EXISTS "Public can read availability" ON public.availability_rules;
CREATE POLICY "Public can read availability"
  ON public.availability_rules
  FOR SELECT
  TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = availability_rules.business_id AND b.deleted_at IS NULL));

-- 6. clients: tighten public insert policy to forbid email/notes
DROP POLICY IF EXISTS "Public can create clients for booking" ON public.clients;
CREATE POLICY "Public can create clients for booking"
  ON public.clients
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    email IS NULL
    AND notes IS NULL
    AND EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = clients.business_id AND b.deleted_at IS NULL)
  );

-- 7. pro_preregistrations: replace WITH CHECK (true) with basic validation
DROP POLICY IF EXISTS "Anyone can preregister" ON public.pro_preregistrations;
CREATE POLICY "Anyone can preregister"
  ON public.pro_preregistrations
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    length(trim(nombre)) BETWEEN 1 AND 120
    AND length(email) BETWEEN 5 AND 254
    AND email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    AND (negocio IS NULL OR length(negocio) <= 160)
    AND (telefono IS NULL OR length(telefono) <= 40)
  );
