
-- Anon (visitantes de la página pública /b/:slug): solo SELECT en tablas necesarias para reservar
GRANT SELECT ON public.businesses TO anon;
GRANT SELECT ON public.locations TO anon;
GRANT SELECT ON public.services TO anon;
GRANT SELECT ON public.professionals TO anon;
GRANT SELECT ON public.location_professionals TO anon;
GRANT SELECT ON public.professional_services TO anon;
GRANT SELECT ON public.location_hours TO anon;
GRANT SELECT ON public.availability_rules TO anon;
GRANT SELECT ON public.appointments TO anon;

-- Authenticated (dueños usando el dashboard): CRUD completo (RLS sigue limitando filas)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.businesses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.locations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.services TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.professionals TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.location_professionals TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.professional_services TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.location_hours TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.availability_rules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_log TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pro_preregistrations TO authenticated;

-- Service role: acceso completo para funciones de servidor
GRANT ALL ON public.businesses, public.locations, public.services, public.professionals,
            public.clients, public.appointments, public.location_professionals,
            public.professional_services, public.location_hours, public.availability_rules,
            public.audit_log, public.pro_preregistrations
  TO service_role;
