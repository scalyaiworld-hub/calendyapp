-- Security hardening (auditoría 2026-10-01).
-- NO aplicar sin revisar: cambia grants y políticas RLS de producción.

-- ============================================================
-- 1. businesses: el dueño ya no puede escribir `plan` ni cambiar `owner_id`.
--    El plan solo lo cambia el servidor con service_role (ver
--    src/lib/api/plan.functions.ts). Las columnas no listadas aquí
--    (plan, id, created_at, updated_at) quedan sin permiso para `authenticated`.
-- ============================================================
REVOKE INSERT, UPDATE ON public.businesses FROM authenticated;

GRANT INSERT (
  owner_id, name, slug, timezone, phone, logo_url, industry,
  whatsapp_country_code, whatsapp_number,
  onboarding_completed, onboarding_step,
  brand_primary, brand_background, brand_font
) ON public.businesses TO authenticated;

GRANT UPDATE (
  name, slug, timezone, phone, logo_url, industry,
  whatsapp_country_code, whatsapp_number,
  onboarding_completed, onboarding_step,
  brand_primary, brand_background, brand_font,
  deleted_at
) ON public.businesses TO authenticated;

DROP POLICY IF EXISTS "Owners can update their business" ON public.businesses;
CREATE POLICY "Owners can update their business"
  ON public.businesses FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- ============================================================
-- 2. Lectura pública solo para `anon`. Antes `authenticated` podía leer
--    TODAS las columnas de todos los negocios (teléfonos, owner_id, plan,
--    client_id y notas de citas). Cada dueño sigue leyendo lo suyo con
--    sus políticas de dueño.
-- ============================================================

-- businesses: no existía política de lectura para el dueño; se agrega.
DROP POLICY IF EXISTS "Public can read businesses by slug" ON public.businesses;
CREATE POLICY "Public can read businesses by slug"
  ON public.businesses FOR SELECT TO anon
  USING (deleted_at IS NULL);

DROP POLICY IF EXISTS "Owners can read their business" ON public.businesses;
CREATE POLICY "Owners can read their business"
  ON public.businesses FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

-- locations / professionals / appointments: las políticas de dueño ya existen
-- ("Owners read locations", "Owners read professionals", "Owners read appointments").
DROP POLICY IF EXISTS "Public can read active locations" ON public.locations;
CREATE POLICY "Public can read active locations"
  ON public.locations FOR SELECT TO anon
  USING (deleted_at IS NULL AND is_active = true);

DROP POLICY IF EXISTS "Public can read active professionals" ON public.professionals;
CREATE POLICY "Public can read active professionals"
  ON public.professionals FOR SELECT TO anon
  USING (deleted_at IS NULL AND is_active = true);

DROP POLICY IF EXISTS "Public can read appointments for availability" ON public.appointments;
CREATE POLICY "Public can read appointments for availability"
  ON public.appointments FOR SELECT TO anon
  USING (
    status IN ('pending'::appointment_status, 'booked'::appointment_status, 'completed'::appointment_status)
    AND EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = appointments.business_id AND b.deleted_at IS NULL)
  );

-- ============================================================
-- 3. Reservas públicas: se hacen solo desde el servidor (service_role) en
--    createPublicBooking, con validaciones. Se elimina el INSERT directo
--    de anon/authenticated que se saltaba esas validaciones.
--    Los dueños siguen creando citas con "Owners manage appointments - insert".
-- ============================================================
DROP POLICY IF EXISTS "Public can create pending appointments" ON public.appointments;
REVOKE INSERT ON public.appointments FROM anon;
REVOKE INSERT ON public.clients FROM anon;

-- ============================================================
-- 4. Comprobar si un slug está libre sin poder leer negocios ajenos.
--    Reemplaza las consultas directas a `businesses` del onboarding y de Ajustes.
--    No filtra por deleted_at porque la restricción UNIQUE de slug también
--    aplica a negocios eliminados.
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_slug_available(_slug text, _exclude_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.slug = _slug
      AND (_exclude_id IS NULL OR b.id <> _exclude_id)
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_slug_available(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_slug_available(text, uuid) TO authenticated, service_role;

-- ============================================================
-- 5. audit_log: nadie escribe ni borra desde el cliente; es solo lectura.
-- ============================================================
REVOKE UPDATE, DELETE ON public.audit_log FROM authenticated;
