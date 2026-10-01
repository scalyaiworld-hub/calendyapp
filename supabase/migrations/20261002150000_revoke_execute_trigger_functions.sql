-- Funciones de trigger: no deben poder llamarse por /rest/v1/rpc. Los triggers siguen funcionando.
REVOKE EXECUTE ON FUNCTION public.block_entity_with_future_appts() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_appointment_refs() FROM PUBLIC, anon, authenticated;
