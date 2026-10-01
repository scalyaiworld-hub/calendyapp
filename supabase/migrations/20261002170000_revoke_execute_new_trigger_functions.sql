-- Funciones de trigger: no deben poder llamarse por /rest/v1/rpc. Los triggers siguen funcionando.
-- Mismo criterio que 20261002150000_revoke_execute_trigger_functions.sql, para las funciones que
-- crearon después las migraciones de marca (20261001161000) y de roles (20261001170000).
-- Va al final: requiere que esas dos migraciones ya estén aplicadas.
REVOKE EXECUTE ON FUNCTION public.enforce_branding_plan() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_member_professional() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.limit_professional_appointment_updates() FROM PUBLIC, anon, authenticated;
