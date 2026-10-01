-- security_hardening dejó a `authenticated` con una lista cerrada de columnas actualizables en
-- businesses; sin este GRANT el dueño no puede guardar la tarjeta de recordatorios (permission denied).
GRANT UPDATE (reminders_enabled, reminder_hours_before) ON public.businesses TO authenticated;
