-- Integraciones (módulo "integrations", plan Studio): claves de API, webhooks y feed de calendario (ICS).
-- NO aplicar sin revisar. Va después de 20261001170000_team_roles.sql.
--
-- Todas las tablas son SOLO de servidor: RLS activado, sin políticas y sin grants para
-- anon/authenticated. El navegador nunca las lee ni escribe; pasa por server functions que
-- comprueban dueño + plan. Así los secretos (hash de claves, secreto de firma, token del feed)
-- no se pueden leer con la clave pública de Supabase.

-- ============================================================
-- Claves de API (se guarda solo el hash SHA-256; la clave completa se muestra una vez)
-- ============================================================
CREATE TABLE public.api_keys (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name         text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 60),
  key_prefix   text NOT NULL,
  key_hash     text NOT NULL UNIQUE,
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);
CREATE INDEX api_keys_business_idx ON public.api_keys (business_id) WHERE revoked_at IS NULL;

-- ============================================================
-- Webhooks salientes
-- ============================================================
CREATE TABLE public.webhook_endpoints (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  url           text NOT NULL CHECK (length(url) <= 500 AND url ~* '^https://'),
  secret        text NOT NULL,
  events        text[] NOT NULL DEFAULT ARRAY['appointment.created', 'appointment.updated', 'appointment.cancelled'],
  is_active     boolean NOT NULL DEFAULT true,
  failure_count integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (events <@ ARRAY['appointment.created', 'appointment.updated', 'appointment.cancelled'])
);
CREATE INDEX webhook_endpoints_business_idx ON public.webhook_endpoints (business_id) WHERE is_active;

-- Cola de eventos (outbox) y entregas por endpoint. El payload no lleva datos personales:
-- solo ids; quien recibe el webhook consulta la API con su clave para ver el detalle.
CREATE TABLE public.webhook_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  event       text NOT NULL,
  payload     jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.webhook_deliveries (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id      uuid NOT NULL REFERENCES public.webhook_endpoints(id) ON DELETE CASCADE,
  event_id         uuid NOT NULL REFERENCES public.webhook_events(id) ON DELETE CASCADE,
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  attempts         integer NOT NULL DEFAULT 0,
  next_attempt_at  timestamptz NOT NULL DEFAULT now(),
  response_status  integer,
  last_error       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (endpoint_id, event_id)
);
CREATE INDEX webhook_deliveries_due_idx ON public.webhook_deliveries (next_attempt_at) WHERE status IN ('pending', 'failed');
CREATE INDEX webhook_events_created_idx ON public.webhook_events (created_at);

-- ============================================================
-- Feed de calendario (ICS): una URL secreta por negocio para suscribirse desde Google Calendar,
-- Apple Calendar u Outlook. Regenerar el token invalida la URL anterior.
-- ============================================================
CREATE TABLE public.calendar_feeds (
  business_id uuid PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,
  token       text NOT NULL UNIQUE CHECK (length(token) >= 32),
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_feeds ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.api_keys, public.webhook_endpoints, public.webhook_events,
  public.webhook_deliveries, public.calendar_feeds FROM anon, authenticated;
GRANT ALL ON public.api_keys, public.webhook_endpoints, public.webhook_events,
  public.webhook_deliveries, public.calendar_feeds TO service_role;

-- ============================================================
-- Emisión de eventos al crear/actualizar/cancelar una cita.
-- Nunca debe romper la escritura de la cita: cualquier error se degrada a un WARNING.
-- ============================================================
CREATE OR REPLACE FUNCTION public.emit_appointment_webhook()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ev text;
  ev_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    ev := 'appointment.created';
  ELSIF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    ev := 'appointment.cancelled';
  ELSIF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.starts_at IS DISTINCT FROM OLD.starts_at
     OR NEW.ends_at IS DISTINCT FROM OLD.ends_at
     OR NEW.professional_id IS DISTINCT FROM OLD.professional_id THEN
    ev := 'appointment.updated';
  ELSE
    RETURN NEW;
  END IF;

  -- Camino rápido: sin endpoints suscritos no se escribe nada.
  IF NOT EXISTS (
    SELECT 1 FROM public.webhook_endpoints e
    WHERE e.business_id = NEW.business_id AND e.is_active AND ev = ANY (e.events)
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.webhook_events (business_id, event, payload)
  VALUES (
    NEW.business_id,
    ev,
    jsonb_build_object(
      'event', ev,
      'appointment', jsonb_build_object(
        'id', NEW.id,
        'status', NEW.status,
        'starts_at', NEW.starts_at,
        'ends_at', NEW.ends_at,
        'client_id', NEW.client_id,
        'service_id', NEW.service_id,
        'professional_id', NEW.professional_id,
        'location_id', NEW.location_id,
        'source', NEW.source
      )
    )
  )
  RETURNING id INTO ev_id;

  INSERT INTO public.webhook_deliveries (endpoint_id, event_id)
  SELECT e.id, ev_id
  FROM public.webhook_endpoints e
  WHERE e.business_id = NEW.business_id AND e.is_active AND ev = ANY (e.events);

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'emit_appointment_webhook failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.emit_appointment_webhook() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER appointments_emit_webhook
  AFTER INSERT OR UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.emit_appointment_webhook();

-- Programación de la entrega (ejecutar a mano una vez; NO guardes el secreto en el repositorio):
--   SELECT cron.schedule(
--     'send-webhooks',
--     '* * * * *',
--     $$ SELECT net.http_post(
--          url := 'https://TU-DOMINIO/api/public/send-webhooks',
--          headers := jsonb_build_object('Authorization', 'Bearer ' || '<REMINDERS_CRON_SECRET>')
--        ) $$
--   );
-- Limpieza opcional de eventos viejos (entregas se borran en cascada):
--   SELECT cron.schedule('prune-webhook-events', '0 4 * * *',
--     $$ DELETE FROM public.webhook_events WHERE created_at < now() - interval '30 days' $$);
