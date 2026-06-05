
-- Recrear vistas con security_invoker = true (respetan RLS del que consulta)
DROP VIEW IF EXISTS public.public_businesses;
DROP VIEW IF EXISTS public.public_locations;
DROP VIEW IF EXISTS public.public_professionals;
DROP VIEW IF EXISTS public.public_appointment_slots;

-- BUSINESSES: restaurar policy pública + grants por columna
CREATE POLICY "Public can read businesses by slug"
  ON public.businesses FOR SELECT
  TO anon, authenticated
  USING (deleted_at IS NULL);

REVOKE SELECT ON public.businesses FROM anon;
GRANT SELECT (id, name, slug, timezone, logo_url, industry, created_at) ON public.businesses TO anon;

CREATE VIEW public.public_businesses
WITH (security_invoker = true, security_barrier = true) AS
SELECT id, name, slug, timezone, logo_url, industry, created_at
FROM public.businesses
WHERE deleted_at IS NULL;
GRANT SELECT ON public.public_businesses TO anon, authenticated;

-- LOCATIONS
CREATE POLICY "Public can read active locations"
  ON public.locations FOR SELECT
  TO anon, authenticated
  USING (deleted_at IS NULL AND is_active = true);

REVOKE SELECT ON public.locations FROM anon;
GRANT SELECT (id, business_id, name, address, is_active, created_at) ON public.locations TO anon;

CREATE VIEW public.public_locations
WITH (security_invoker = true, security_barrier = true) AS
SELECT id, business_id, name, address, is_active, created_at
FROM public.locations
WHERE deleted_at IS NULL AND is_active = true;
GRANT SELECT ON public.public_locations TO anon, authenticated;

-- PROFESSIONALS
CREATE POLICY "Public can read active professionals"
  ON public.professionals FOR SELECT
  TO anon, authenticated
  USING (deleted_at IS NULL AND is_active = true);

REVOKE SELECT ON public.professionals FROM anon;
GRANT SELECT (id, business_id, name, avatar_url, is_active, created_at) ON public.professionals TO anon;

CREATE VIEW public.public_professionals
WITH (security_invoker = true, security_barrier = true) AS
SELECT id, business_id, name, avatar_url, is_active, created_at
FROM public.professionals
WHERE deleted_at IS NULL AND is_active = true;
GRANT SELECT ON public.public_professionals TO anon, authenticated;

-- APPOINTMENTS
CREATE POLICY "Public can read appointments for availability"
  ON public.appointments FOR SELECT
  TO anon, authenticated
  USING (
    status IN ('pending'::appointment_status, 'booked'::appointment_status, 'completed'::appointment_status)
    AND EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = appointments.business_id AND b.deleted_at IS NULL)
  );

REVOKE SELECT ON public.appointments FROM anon;
GRANT SELECT (id, business_id, professional_id, location_id, starts_at, ends_at, status) ON public.appointments TO anon;

CREATE VIEW public.public_appointment_slots
WITH (security_invoker = true, security_barrier = true) AS
SELECT id, business_id, professional_id, location_id, starts_at, ends_at, status
FROM public.appointments
WHERE status IN ('pending'::appointment_status, 'booked'::appointment_status, 'completed'::appointment_status);
GRANT SELECT ON public.public_appointment_slots TO anon, authenticated;
