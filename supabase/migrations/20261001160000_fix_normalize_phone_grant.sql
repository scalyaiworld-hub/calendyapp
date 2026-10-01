-- El trigger normalize_client_phone() corre con los permisos del usuario que
-- inserta el cliente y llama a normalize_phone(). Al revocar EXECUTE a
-- `authenticated` (20260616151753) se rompió la creación de clientes:
--   "permission denied for function normalize_phone".
-- normalize_phone es una función pura (solo regexp_replace), sin acceso a
-- tablas, así que es seguro devolver el permiso.
GRANT EXECUTE ON FUNCTION public.normalize_phone(text) TO authenticated;
