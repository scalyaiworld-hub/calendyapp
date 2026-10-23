-- Sincronización Calendya → Google Calendar (módulo "integrations", plan Studio).
-- NO aplicar sin revisar. Va después de 20261003110000_ai_chat.sql.
-- Diseño: docs/superpowers/specs/2026-10-23-google-calendar-sync-design.md
--
-- Todas las tablas son SOLO de servidor: RLS activado, sin políticas y sin grants para
-- anon/authenticated. Los tokens de Google se guardan cifrados (AES-GCM) por la aplicación.

-- ============================================================
-- Conexión OAuth (una por negocio)
-- ============================================================
CREATE TABLE public.google_calendar_connections (
  business_id                 uuid PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,
  google_email                text NOT NULL,
  refresh_token_enc           text NOT NULL,
  access_token_enc            text,
  access_token_expires_at     timestamptz,
  default_calendar_id         text NOT NULL DEFAULT 'primary' CHECK (length(default_calendar_id) BETWEEN 1 AND 300),
  status                      text NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active', 'revoked', 'error', 'disconnecting')),
  delete_events_on_disconnect boolean NOT NULL DEFAULT false,
  last_error                  text,
  last_synced_at              timestamptz,
  connected_by                uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  connected_at                timestamptz NOT NULL DEFAULT now()
);

-- Calendario de destino por profesional (de la misma cuenta). Sin fila = calendario por defecto.
CREATE TABLE public.google_calendar_professional_map (
  professional_id uuid PRIMARY KEY REFERENCES public.professionals(id) ON DELETE CASCADE,
  business_id     uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  calendar_id     text NOT NULL CHECK (length(calendar_id) BETWEEN 1 AND 300)
);
CREATE INDEX google_calendar_professional_map_business_idx
  ON public.google_calendar_professional_map (business_id);

-- Vínculo cita ↔ evento de Google. Sin FK a appointments: debe sobrevivir al borrado de la cita
-- para poder borrar también el evento.
CREATE TABLE public.google_calendar_events (
  appointment_id  uuid PRIMARY KEY,
  business_id     uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  calendar_id     text NOT NULL,
  google_event_id text NOT NULL,
  synced_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX google_calendar_events_business_idx ON public.google_calendar_events (business_id);

-- Cola (outbox). Un solo job pendiente por cita: los cambios seguidos se colapsan y suben `version`,
-- así el worker sabe si la cita cambió mientras la procesaba. `locked_until` es el arrendamiento
-- del worker (evita que dos ejecuciones procesen el mismo job a la vez).
CREATE TABLE public.google_calendar_jobs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  appointment_id  uuid NOT NULL,
  action          text NOT NULL CHECK (action IN ('upsert', 'delete')),
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'failed')),
  attempts        integer NOT NULL DEFAULT 0,
  version         integer NOT NULL DEFAULT 1,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_until    timestamptz,
  last_error      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX google_calendar_jobs_one_pending_idx
  ON public.google_calendar_jobs (appointment_id) WHERE status = 'pending';
CREATE INDEX google_calendar_jobs_due_idx
  ON public.google_calendar_jobs (next_attempt_at) WHERE status = 'pending';
CREATE INDEX google_calendar_jobs_business_idx
  ON public.google_calendar_jobs (business_id, status);

ALTER TABLE public.google_calendar_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_calendar_professional_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_calendar_jobs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.google_calendar_connections, public.google_calendar_professional_map,
  public.google_calendar_events, public.google_calendar_jobs FROM anon, authenticated;
GRANT ALL ON public.google_calendar_connections, public.google_calendar_professional_map,
  public.google_calendar_events, public.google_calendar_jobs TO service_role;

-- ============================================================
-- Encolado
-- ============================================================
CREATE OR REPLACE FUNCTION public.google_calendar_enqueue(
  p_business_id uuid,
  p_appointment_id uuid,
  p_action text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.google_calendar_jobs (business_id, appointment_id, action)
  VALUES (p_business_id, p_appointment_id, p_action)
  ON CONFLICT (appointment_id) WHERE status = 'pending'
  DO UPDATE SET
    action          = EXCLUDED.action,
    attempts        = 0,
    version         = public.google_calendar_jobs.version + 1,
    next_attempt_at = now(),
    last_error      = NULL,
    updated_at      = now();
$$;

-- Encola un upsert por cada cita próxima activa (hasta 180 días, máx. 2000). Modos:
--   'all'          todas las citas próximas (al conectar)
--   'default'      las que van al calendario por defecto (sin profesional o profesional sin mapeo)
--   'professional' las de p_professional_id
CREATE OR REPLACE FUNCTION public.google_calendar_enqueue_upcoming(
  p_business_id uuid,
  p_mode text,
  p_professional_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer := 0;
  r record;
BEGIN
  IF p_mode NOT IN ('all', 'default', 'professional') THEN
    RAISE EXCEPTION 'google_calendar_enqueue_upcoming: modo no válido %', p_mode;
  END IF;
  FOR r IN
    SELECT a.id
    FROM public.appointments a
    WHERE a.business_id = p_business_id
      AND a.status IN ('pending', 'booked')
      AND a.starts_at >= now()
      AND a.starts_at <= now() + interval '180 days'
      AND (
        p_mode = 'all'
        OR (p_mode = 'professional' AND a.professional_id = p_professional_id)
        OR (p_mode = 'default' AND (
              a.professional_id IS NULL
              OR NOT EXISTS (
                SELECT 1 FROM public.google_calendar_professional_map m
                WHERE m.professional_id = a.professional_id
              )))
      )
    ORDER BY a.starts_at
    LIMIT 2000
  LOOP
    PERFORM public.google_calendar_enqueue(p_business_id, r.id, 'upsert');
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

-- Encola el borrado de todos los eventos creados en Google (desconexión con borrado).
CREATE OR REPLACE FUNCTION public.google_calendar_enqueue_delete_all(p_business_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer := 0;
  r record;
BEGIN
  FOR r IN
    SELECT e.appointment_id FROM public.google_calendar_events e WHERE e.business_id = p_business_id
  LOOP
    PERFORM public.google_calendar_enqueue(p_business_id, r.appointment_id, 'delete');
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

-- Trigger de citas. Nunca debe romper la escritura de la cita: cualquier error se degrada a WARNING.
CREATE OR REPLACE FUNCTION public.enqueue_google_calendar_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec public.appointments;
  act text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    rec := OLD;
  ELSE
    rec := NEW;
  END IF;

  -- Camino rápido: sin conexión activa no se escribe nada.
  IF NOT EXISTS (
    SELECT 1 FROM public.google_calendar_connections c
    WHERE c.business_id = rec.business_id AND c.status = 'active'
  ) THEN
    RETURN NULL;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF NOT EXISTS (SELECT 1 FROM public.google_calendar_events e WHERE e.appointment_id = OLD.id) THEN
      RETURN NULL;
    END IF;
    act := 'delete';
  ELSIF NEW.status IN ('cancelled', 'no_show') THEN
    -- Solo al pasar a inactiva; una cita creada ya cancelada no llega a Google.
    IF TG_OP = 'INSERT' OR OLD.status IN ('cancelled', 'no_show') THEN
      RETURN NULL;
    END IF;
    act := 'delete';
  ELSIF TG_OP = 'INSERT'
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.starts_at IS DISTINCT FROM OLD.starts_at
     OR NEW.ends_at IS DISTINCT FROM OLD.ends_at
     OR NEW.professional_id IS DISTINCT FROM OLD.professional_id
     OR NEW.service_id IS DISTINCT FROM OLD.service_id
     OR NEW.client_id IS DISTINCT FROM OLD.client_id
     OR NEW.notes IS DISTINCT FROM OLD.notes THEN
    act := 'upsert';
  ELSE
    RETURN NULL;
  END IF;

  PERFORM public.google_calendar_enqueue(rec.business_id, rec.id, act);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'enqueue_google_calendar_job failed: %', SQLERRM;
  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.google_calendar_enqueue(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.google_calendar_enqueue_upcoming(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.google_calendar_enqueue_delete_all(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_google_calendar_job() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.google_calendar_enqueue(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.google_calendar_enqueue_upcoming(uuid, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.google_calendar_enqueue_delete_all(uuid) TO service_role;

CREATE TRIGGER appointments_enqueue_google_calendar
  AFTER INSERT OR UPDATE OR DELETE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_google_calendar_job();

-- Programación del worker (ejecutar a mano una vez; NO guardes el secreto en el repositorio):
--   SELECT cron.schedule(
--     'sync-google-calendar',
--     '* * * * *',
--     $$ SELECT net.http_post(
--          url := 'https://TU-DOMINIO/api/public/sync-google-calendar',
--          headers := jsonb_build_object('Authorization', 'Bearer ' || '<REMINDERS_CRON_SECRET>')
--        ) $$
--   );
-- Limpieza opcional de jobs terminados:
--   SELECT cron.schedule('prune-google-calendar-jobs', '15 4 * * *',
--     $$ DELETE FROM public.google_calendar_jobs
--        WHERE status IN ('done', 'failed') AND updated_at < now() - interval '7 days' $$);
