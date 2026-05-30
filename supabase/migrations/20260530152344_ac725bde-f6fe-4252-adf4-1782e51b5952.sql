
ALTER FUNCTION public.touch_updated_at() SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.is_business_owner(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_business_owner(uuid) TO authenticated, service_role;
