-- Higiene de permisos: Supabase concede por defecto todos los privilegios de tabla a
-- anon y authenticated, y RLS es lo único que los frena. Se retiran los que ninguna
-- parte de la app necesita.
-- NO aplicar sin revisar. Probar primero en un entorno de pruebas.

-- TRUNCATE, REFERENCES y TRIGGER no los usa ningún cliente. TRUNCATE además ignora RLS.
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

-- anon no escribe en ninguna tabla salvo el formulario de preregistro de la landing.
-- Las reservas públicas pasan por el servidor (service_role).
REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM anon;
GRANT INSERT ON public.pro_preregistrations TO anon;
