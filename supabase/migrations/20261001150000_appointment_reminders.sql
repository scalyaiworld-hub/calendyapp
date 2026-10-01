-- Recordatorios de citas por email (módulo "reminders", planes Pro y Studio).
-- NO aplicar sin revisar. Solo el servidor (service_role) lee y escribe appointment_reminders.

ALTER TABLE public.businesses
  ADD COLUMN reminders_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN reminder_hours_before integer NOT NULL DEFAULT 24
    CHECK (reminder_hours_before BETWEEN 1 AND 72);

CREATE TABLE public.appointment_reminders (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  business_id    uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  channel        text NOT NULL DEFAULT 'email' CHECK (channel IN ('email')),
  status         text NOT NULL DEFAULT 'sending' CHECK (status IN ('sending', 'sent', 'failed')),
  attempts       integer NOT NULL DEFAULT 1,
  error          text,
  provider_id    text,
  sent_at        timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  -- Un recordatorio por cita y canal: evita duplicados aunque el cron corra dos veces a la vez.
  UNIQUE (appointment_id, channel)
);

CREATE INDEX appointment_reminders_business_idx ON public.appointment_reminders (business_id, created_at DESC);
CREATE INDEX appointment_reminders_retry_idx ON public.appointment_reminders (status, updated_at)
  WHERE status IN ('sending', 'failed');

ALTER TABLE public.appointment_reminders ENABLE ROW LEVEL SECURITY;

-- Sin políticas ni grants para anon/authenticated: el acceso es solo vía server routes.
REVOKE ALL ON public.appointment_reminders FROM anon, authenticated;
GRANT ALL ON public.appointment_reminders TO service_role;

-- Programación (ejecutar a mano una vez, con el secreto real; NO lo guardes en el repositorio).
-- Requiere las extensiones pg_cron y pg_net. Cada 15 minutos llama a la ruta del servidor:
--
--   SELECT cron.schedule(
--     'send-appointment-reminders',
--     '*/15 * * * *',
--     $$ SELECT net.http_post(
--          url := 'https://TU-DOMINIO/api/public/send-reminders',
--          headers := jsonb_build_object('Authorization', 'Bearer ' || '<REMINDERS_CRON_SECRET>')
--        ) $$
--   );
