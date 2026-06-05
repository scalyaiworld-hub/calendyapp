
-- 1. Restringir ejecución de función SECURITY DEFINER
REVOKE EXECUTE ON FUNCTION public.is_business_owner(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_business_owner(uuid) TO authenticated, service_role;

-- 2. Mover extensión btree_gist fuera de public
ALTER EXTENSION btree_gist SET SCHEMA extensions;

-- 3. BUSINESSES: quitar lectura pública directa, exponer vista limitada
DROP POLICY IF EXISTS "Public can read businesses by slug" ON public.businesses;

CREATE OR REPLACE VIEW public.public_businesses
WITH (security_barrier = true) AS
SELECT id, name, slug, timezone, logo_url, industry, created_at
FROM public.businesses
WHERE deleted_at IS NULL;

GRANT SELECT ON public.public_businesses TO anon, authenticated;

-- 4. LOCATIONS: quitar exposición pública de teléfono
DROP POLICY IF EXISTS "Public can read active locations" ON public.locations;

CREATE OR REPLACE VIEW public.public_locations
WITH (security_barrier = true) AS
SELECT id, business_id, name, address, is_active, created_at
FROM public.locations
WHERE deleted_at IS NULL AND is_active = true;

GRANT SELECT ON public.public_locations TO anon, authenticated;

-- 5. PROFESSIONALS: quitar exposición pública de teléfono
DROP POLICY IF EXISTS "Public can read active professionals" ON public.professionals;

CREATE OR REPLACE VIEW public.public_professionals
WITH (security_barrier = true) AS
SELECT id, business_id, name, avatar_url, is_active, created_at
FROM public.professionals
WHERE deleted_at IS NULL AND is_active = true;

GRANT SELECT ON public.public_professionals TO anon, authenticated;

-- 6. APPOINTMENTS: quitar lectura pública de todos los campos, exponer solo los mínimos para calcular disponibilidad
DROP POLICY IF EXISTS "Public can read appointments for availability" ON public.appointments;

CREATE OR REPLACE VIEW public.public_appointment_slots
WITH (security_barrier = true) AS
SELECT id, business_id, professional_id, location_id, starts_at, ends_at, status
FROM public.appointments
WHERE status IN ('pending'::appointment_status, 'booked'::appointment_status, 'completed'::appointment_status);

GRANT SELECT ON public.public_appointment_slots TO anon, authenticated;

-- 7. CLIENTS: limitar columnas que un anónimo puede insertar (sin email/notes)
REVOKE INSERT ON public.clients FROM anon;
GRANT INSERT (business_id, name, phone, phone_country_code) ON public.clients TO anon;
