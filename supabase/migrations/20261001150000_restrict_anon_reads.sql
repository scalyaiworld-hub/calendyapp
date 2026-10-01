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
-- 2. pro_preregistrations: anon y authenticated solo pueden insertar (formulario de la landing).
--    En producción ambos tenían SELECT, UPDATE y DELETE; solo los frenaba la falta de políticas.
-- ============================================================
REVOKE ALL ON public.pro_preregistrations FROM anon, authenticated;
GRANT INSERT ON public.pro_preregistrations TO anon, authenticated;

-- ============================================================
-- 3. Vistas public_*: en producción anon y authenticated tienen INSERT/UPDATE/DELETE
--    (privilegios por defecto de Supabase). Las vistas son actualizables, pero tienen
--    security_invoker=true, así que RLS de las tablas base se aplica al llamador y no
--    hay escritura posible hoy. Es defensa en profundidad: el código no las usa, se
--    retiran todos los permisos para que no dependan solo de RLS.
-- ============================================================
REVOKE ALL ON public.public_businesses, public.public_locations,
  public.public_professionals, public.public_appointment_slots FROM anon, authenticated;

-- ============================================================
-- 4. user_roles: decide quién es admin. El servidor la lee con service_role;
--    los usuarios solo necesitan leer sus propias filas (política "Users read own roles").
-- ============================================================
REVOKE ALL ON public.user_roles FROM anon, authenticated;
GRANT SELECT ON public.user_roles TO authenticated;
