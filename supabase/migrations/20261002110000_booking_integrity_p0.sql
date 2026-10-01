-- Integridad y anti-abuso de las reservas (informe de lógica de negocio, P0).
-- NO aplicar sin revisar: reemplaza el trigger de cupo y añade constraints.
--
-- Regla de capacidad (una cita ocupa UN recurso a la vez):
--   * con profesional      -> el recurso es el profesional;
--   * sin profesional      -> el recurso es la sucursal;
--   * sin ambos            -> el recurso es el negocio completo.
-- Dos citas activas (pending/booked) no pueden solaparse en el mismo recurso.

-- ============================================================
-- 1. Anti-solape también para citas sin profesional ni sucursal
--    (las otras dos reglas ya existen desde 20260616). Si hay datos
--    antiguos solapados no se crea la regla y se avisa.
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.appointments a
    JOIN public.appointments b
      ON a.business_id = b.business_id AND a.id < b.id
     AND tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(b.starts_at, b.ends_at, '[)')
    WHERE a.professional_id IS NULL AND a.location_id IS NULL AND a.status IN ('pending','booked')
      AND b.professional_id IS NULL AND b.location_id IS NULL AND b.status IN ('pending','booked')
  ) THEN
    RAISE WARNING 'appts_no_overlap_business_level NO se creó: hay citas activas solapadas sin profesional ni sucursal. Corrígelas y vuelve a ejecutar.';
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'appts_no_overlap_business_level'
  ) THEN
    ALTER TABLE public.appointments
      ADD CONSTRAINT appts_no_overlap_business_level
      EXCLUDE USING gist (
        business_id WITH =,
        tstzrange(starts_at, ends_at, '[)') WITH &&
      )
      WHERE (professional_id IS NULL AND location_id IS NULL AND status IN ('pending','booked'));
  END IF;
END $$;

-- ============================================================
-- 2. Una cita solo puede referenciar entidades de su propio negocio.
--    (RLS solo comprobaba business_id: un dueño podía asociar el cliente
--    o el servicio de otro negocio.)
-- ============================================================
CREATE OR REPLACE FUNCTION public.validate_appointment_refs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(current_setting('app.bypass_appt_guard', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.clients WHERE id = NEW.client_id AND business_id = NEW.business_id) THEN
    RAISE EXCEPTION 'APPT_REF_MISMATCH:client' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.services WHERE id = NEW.service_id AND business_id = NEW.business_id) THEN
    RAISE EXCEPTION 'APPT_REF_MISMATCH:service' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.professional_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.professionals WHERE id = NEW.professional_id AND business_id = NEW.business_id) THEN
    RAISE EXCEPTION 'APPT_REF_MISMATCH:professional' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.location_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.locations WHERE id = NEW.location_id AND business_id = NEW.business_id) THEN
    RAISE EXCEPTION 'APPT_REF_MISMATCH:location' USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_appointment_refs ON public.appointments;
CREATE TRIGGER trg_validate_appointment_refs
  BEFORE INSERT OR UPDATE OF business_id, client_id, service_id, professional_id, location_id ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.validate_appointment_refs();

-- ============================================================
-- 3. El cupo mensual lo consumen las citas confirmadas, no las pendientes.
--    Una pendiente (p. ej. creada por un bot desde la página pública) ya no
--    puede agotar el plan Free: el cupo se valida al confirmar (pending -> booked).
-- ============================================================
CREATE OR REPLACE FUNCTION public.enforce_plan_limits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan text;
  v_tz text;
  v_limit integer;
  v_used integer;
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  IF coalesce(current_setting('app.bypass_plan_limits', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  SELECT plan, coalesce(timezone, 'America/Lima') INTO v_plan, v_tz
  FROM public.businesses WHERE id = NEW.business_id;
  IF v_plan IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'appointments' THEN
    -- Canceladas y pendientes no consumen cupo.
    IF NEW.status IN ('cancelled', 'pending') THEN
      RETURN NEW;
    END IF;

    v_limit := public.plan_limit(v_plan, 'appointments_per_month');
    IF v_limit IS NULL THEN
      RETURN NEW;
    END IF;

    v_start := date_trunc('month', NEW.starts_at AT TIME ZONE v_tz) AT TIME ZONE v_tz;
    v_end := (date_trunc('month', NEW.starts_at AT TIME ZONE v_tz) + interval '1 month') AT TIME ZONE v_tz;

    -- Si ya consumía cupo en ese mismo mes (p. ej. reprogramación) no se vuelve a contar.
    IF TG_OP = 'UPDATE'
       AND OLD.status NOT IN ('cancelled', 'pending')
       AND OLD.starts_at >= v_start AND OLD.starts_at < v_end THEN
      RETURN NEW;
    END IF;

    SELECT count(*) INTO v_used
    FROM public.appointments
    WHERE business_id = NEW.business_id
      AND id <> NEW.id
      AND status NOT IN ('cancelled', 'pending')
      AND starts_at >= v_start
      AND starts_at < v_end;
    IF v_used >= v_limit THEN
      RAISE EXCEPTION 'PLAN_LIMIT_APPOINTMENTS:%/%/%', v_plan, v_used, v_limit
        USING ERRCODE = 'check_violation';
    END IF;

  ELSIF TG_TABLE_NAME = 'locations' THEN
    IF NEW.deleted_at IS NOT NULL OR NOT NEW.is_active THEN
      RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.deleted_at IS NULL AND OLD.is_active THEN
      RETURN NEW;
    END IF;
    v_limit := public.plan_limit(v_plan, 'locations');
    IF v_limit IS NOT NULL THEN
      SELECT count(*) INTO v_used
      FROM public.locations
      WHERE business_id = NEW.business_id AND id <> NEW.id
        AND deleted_at IS NULL AND is_active;
      IF v_used >= v_limit THEN
        RAISE EXCEPTION 'PLAN_LIMIT_LOCATIONS:%/%/%', v_plan, v_used, v_limit
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;

  ELSIF TG_TABLE_NAME = 'professionals' THEN
    IF NEW.deleted_at IS NOT NULL OR NOT NEW.is_active THEN
      RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.deleted_at IS NULL AND OLD.is_active THEN
      RETURN NEW;
    END IF;
    v_limit := public.plan_limit(v_plan, 'professionals');
    IF v_limit IS NOT NULL THEN
      SELECT count(*) INTO v_used
      FROM public.professionals
      WHERE business_id = NEW.business_id AND id <> NEW.id
        AND deleted_at IS NULL AND is_active;
      IF v_used >= v_limit THEN
        RAISE EXCEPTION 'PLAN_LIMIT_PROFESSIONALS:%/%/%', v_plan, v_used, v_limit
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================
-- 4. Las reservas pendientes sin confirmar caducan (liberan el horario).
-- ============================================================
CREATE OR REPLACE FUNCTION public.expire_stale_pending(_business_id uuid DEFAULT NULL, _hours integer DEFAULT 48)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.appointments
  SET status = 'cancelled',
      cancelled_at = now(),
      cancelled_reason = 'Expirada: no se confirmó a tiempo'
  WHERE status = 'pending'
    AND source = 'booking_page'
    AND created_at < now() - make_interval(hours => _hours)
    AND (_business_id IS NULL OR business_id = _business_id);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.expire_stale_pending(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_stale_pending(uuid, integer) TO service_role;

-- Si pg_cron está disponible, caducidad periódica además de la perezosa (al reservar/listar horarios).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('expire-stale-pending', '*/30 * * * *', 'SELECT public.expire_stale_pending()');
  END IF;
END $$;

-- ============================================================
-- 5. Límite de intentos de reserva pública (por IP y por teléfono).
--    Solo el servidor (service_role) lee y escribe.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.booking_attempts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  ip_hash     text NOT NULL,
  phone       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS booking_attempts_ip_idx ON public.booking_attempts (ip_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS booking_attempts_phone_idx ON public.booking_attempts (business_id, phone, created_at DESC);

ALTER TABLE public.booking_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.booking_attempts FROM anon, authenticated;
GRANT ALL ON public.booking_attempts TO service_role;
