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
-- 2. pro_preregistrations: authenticated solo puede insertar (el formulario de la landing).
--    Antes tenía SELECT, UPDATE y DELETE concedidos; solo los frenaba la falta de políticas.
-- ============================================================
REVOKE ALL ON public.pro_preregistrations FROM authenticated;
GRANT INSERT ON public.pro_preregistrations TO authenticated;
