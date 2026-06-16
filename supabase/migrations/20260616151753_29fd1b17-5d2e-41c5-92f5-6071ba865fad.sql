
-- normalize_phone: añade search_path inmutable
CREATE OR REPLACE FUNCTION public.normalize_phone(p text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p IS NULL THEN NULL
    ELSE regexp_replace(p, '[^0-9+]', '', 'g')
  END;
$$;

-- Revocar EXECUTE a roles expuestos en la API (PostgREST)
-- Estas funciones se invocan únicamente desde triggers internos.
REVOKE EXECUTE ON FUNCTION public.enforce_plan_limits() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalc_client_counters(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_client_counters_from_appt() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_appointment_update() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.normalize_client_phone() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.plan_limit(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.normalize_phone(text) FROM PUBLIC, anon, authenticated;
