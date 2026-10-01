-- Cierra la lectura anónima directa de tablas y recorta permisos de pro_preregistrations.
-- NO aplicar sin revisar. Va después de 20261001120000_security_hardening.sql.

-- ============================================================
-- 1. anon ya no lee businesses, locations, professionals ni appointments.
--    La migración 20260609063423 volvió a dar GRANT SELECT de tabla completa a
--    `anon`, lo que dejaba leer todas las columnas (owner_id, plan, teléfonos,
--    client_id y notas de citas) con solo la clave pública. La página /b/:slug
--    lee estos datos desde servidor (service_role, public-booking.functions.ts)
--    y ningún código del cliente usa las vistas public_* ni lecturas anónimas.
-- ============================================================
DROP POLICY IF EXISTS "Public can read businesses by slug" ON public.businesses;
DROP POLICY IF EXISTS "Public can read active locations" ON public.locations;
DROP POLICY IF EXISTS "Public can read active professionals" ON public.professionals;
DROP POLICY IF EXISTS "Public can read appointments for availability" ON public.appointments;

REVOKE SELECT ON public.businesses, public.locations, public.professionals, public.appointments FROM anon;

-- ============================================================
-- 1b. Mismo cierre para las tablas auxiliares. Sus políticas "Public can read ..."
--     eran USING (true) TO anon, authenticated: cualquiera, incluso otro dueño
--     con sesión, podía leer horarios, asignaciones y servicios de TODOS los
--     negocios. El servidor las lee con service_role; los dueños siguen leyendo
--     lo suyo con sus políticas de dueño.
-- ============================================================
DROP POLICY IF EXISTS "Public can read active services" ON public.services;
DROP POLICY IF EXISTS "Public can read location hours" ON public.location_hours;
DROP POLICY IF EXISTS "Public can read location professionals" ON public.location_professionals;
DROP POLICY IF EXISTS "Public can read professional services" ON public.professional_services;
DROP POLICY IF EXISTS "Public can read availability" ON public.availability_rules;

-- services, location_hours, location_professionals y professional_services ya tienen
-- política de dueño que cubre SELECT. availability_rules solo tenía INSERT/UPDATE/DELETE
-- para el dueño; sin esta política el dashboard dejaría de leer sus reglas.
CREATE POLICY "Owners read availability"
  ON public.availability_rules FOR SELECT TO authenticated
  USING (public.is_business_owner(business_id));

REVOKE SELECT ON public.services, public.location_hours, public.location_professionals,
  public.professional_services, public.availability_rules FROM anon;

-- ============================================================
-- 2. pro_preregistrations: authenticated solo puede insertar (el formulario de la landing).
--    Antes tenía SELECT, UPDATE y DELETE concedidos; solo los frenaba la falta de políticas.
-- ============================================================
REVOKE ALL ON public.pro_preregistrations FROM authenticated;
GRANT INSERT ON public.pro_preregistrations TO authenticated;
