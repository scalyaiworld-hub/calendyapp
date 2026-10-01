-- anon no lee audit_log ni clients (ya bloqueado por RLS); se retira también el permiso.
REVOKE SELECT ON public.audit_log, public.clients FROM anon;
