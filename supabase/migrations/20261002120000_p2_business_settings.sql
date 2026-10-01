-- Mejoras de lógica de negocio P2.
-- NO aplicar sin revisar: añade columnas, tablas, triggers y funciones.
--
-- 1. Reglas de reserva configurables por negocio.
-- 2. Cierres (feriados / vacaciones) y guardado atómico de horarios.
-- 3. Enlace de gestión para el cliente (ver / cancelar su cita).
-- 4. No se puede eliminar ni desactivar un servicio, profesional o sucursal con citas futuras.
-- 5. Funciones de agregación para el panel de admin (sin límites silenciosos).

-- ============================================================
-- 1. Reglas de reserva por negocio
-- ============================================================
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS booking_min_lead_minutes integer NOT NULL DEFAULT 30
    CHECK (booking_min_lead_minutes BETWEEN 0 AND 1440),
  ADD COLUMN IF NOT EXISTS booking_max_ahead_days integer NOT NULL DEFAULT 90
    CHECK (booking_max_ahead_days BETWEEN 1 AND 365),
  -- NULL = el paso entre horarios es la duración del servicio.
  ADD COLUMN IF NOT EXISTS booking_slot_step_minutes integer
    CHECK (booking_slot_step_minutes IS NULL OR booking_slot_step_minutes BETWEEN 5 AND 240),
  ADD COLUMN IF NOT EXISTS booking_buffer_minutes integer NOT NULL DEFAULT 0
    CHECK (booking_buffer_minutes BETWEEN 0 AND 120),
  ADD COLUMN IF NOT EXISTS booking_cancel_min_hours integer NOT NULL DEFAULT 2
    CHECK (booking_cancel_min_hours BETWEEN 0 AND 168),
  -- NULL = sin política de no-shows. Con N, quien acumula N o más no puede reservar online.
  ADD COLUMN IF NOT EXISTS booking_max_no_shows integer
    CHECK (booking_max_no_shows IS NULL OR booking_max_no_shows >= 1);

GRANT UPDATE (
  booking_min_lead_minutes, booking_max_ahead_days, booking_slot_step_minutes,
  booking_buffer_minutes, booking_cancel_min_hours, booking_max_no_shows
) ON public.businesses TO authenticated;

-- ============================================================
-- 2. Cierres y guardado atómico de horarios
-- ============================================================
CREATE TABLE IF NOT EXISTS public.availability_exceptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  starts_on   date NOT NULL,
  ends_on     date NOT NULL,
  note        text CHECK (note IS NULL OR length(note) <= 120),
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on >= starts_on),
  CHECK (ends_on - starts_on <= 366)
);
CREATE INDEX IF NOT EXISTS availability_exceptions_biz_idx ON public.availability_exceptions (business_id, starts_on, ends_on);

ALTER TABLE public.availability_exceptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.availability_exceptions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.availability_exceptions TO authenticated;
GRANT ALL ON public.availability_exceptions TO service_role;

CREATE POLICY "Owners manage availability exceptions - select"
  ON public.availability_exceptions FOR SELECT TO authenticated USING (public.is_business_owner(business_id));
CREATE POLICY "Owners manage availability exceptions - insert"
  ON public.availability_exceptions FOR INSERT TO authenticated WITH CHECK (public.is_business_owner(business_id));
CREATE POLICY "Owners manage availability exceptions - update"
  ON public.availability_exceptions FOR UPDATE TO authenticated
  USING (public.is_business_owner(business_id)) WITH CHECK (public.is_business_owner(business_id));
CREATE POLICY "Owners manage availability exceptions - delete"
  ON public.availability_exceptions FOR DELETE TO authenticated USING (public.is_business_owner(business_id));

-- Reemplaza TODOS los horarios del negocio en una sola transacción (si algo falla, no se pierde nada).
-- _rules: [{ "day_of_week": 1, "start_time": "09:00", "end_time": "13:00" }, ...]
-- Varias ventanas el mismo día = turno partido / descanso. Las ventanas no pueden solaparse.
CREATE OR REPLACE FUNCTION public.replace_availability_rules(_business_id uuid, _rules jsonb)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_business_owner(_business_id) THEN
    RAISE EXCEPTION 'No tienes permiso para cambiar los horarios de este negocio';
  END IF;

  DELETE FROM public.availability_rules WHERE business_id = _business_id;

  INSERT INTO public.availability_rules (business_id, day_of_week, start_time, end_time)
  SELECT _business_id, (r->>'day_of_week')::smallint, (r->>'start_time')::time, (r->>'end_time')::time
  FROM jsonb_array_elements(coalesce(_rules, '[]'::jsonb)) AS r;

  IF EXISTS (
    SELECT 1 FROM public.availability_rules a
    JOIN public.availability_rules b
      ON a.business_id = b.business_id AND a.day_of_week = b.day_of_week AND a.id < b.id
     AND a.start_time < b.end_time AND b.start_time < a.end_time
    WHERE a.business_id = _business_id
  ) THEN
    RAISE EXCEPTION 'AVAILABILITY_OVERLAP';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.replace_location_hours(_location_id uuid, _rules jsonb)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_business uuid;
BEGIN
  SELECT business_id INTO v_business FROM public.locations WHERE id = _location_id;
  IF v_business IS NULL OR NOT public.is_business_owner(v_business) THEN
    RAISE EXCEPTION 'No tienes permiso para cambiar los horarios de esta sucursal';
  END IF;

  DELETE FROM public.location_hours WHERE location_id = _location_id;

  INSERT INTO public.location_hours (location_id, day_of_week, start_time, end_time)
  SELECT _location_id, (r->>'day_of_week')::smallint, (r->>'start_time')::time, (r->>'end_time')::time
  FROM jsonb_array_elements(coalesce(_rules, '[]'::jsonb)) AS r;

  IF EXISTS (
    SELECT 1 FROM public.location_hours a
    JOIN public.location_hours b
      ON a.location_id = b.location_id AND a.day_of_week = b.day_of_week AND a.id < b.id
     AND a.start_time < b.end_time AND b.start_time < a.end_time
    WHERE a.location_id = _location_id
  ) THEN
    RAISE EXCEPTION 'AVAILABILITY_OVERLAP';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.replace_availability_rules(uuid, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.replace_location_hours(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_availability_rules(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.replace_location_hours(uuid, jsonb) TO authenticated, service_role;

-- ============================================================
-- 3. Enlace de gestión para el cliente
-- ============================================================
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS manage_token uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS appointments_manage_token_idx ON public.appointments (manage_token);

-- ============================================================
-- 4. Servicios, profesionales y sucursales con citas futuras no se eliminan ni desactivan
-- ============================================================
CREATE OR REPLACE FUNCTION public.block_entity_with_future_appts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n integer;
BEGIN
  IF coalesce(current_setting('app.bypass_appt_guard', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  IF NOT ((NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL)
          OR (NOT NEW.is_active AND OLD.is_active)) THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'services' THEN
    SELECT count(*) INTO v_n FROM public.appointments
      WHERE service_id = NEW.id AND status IN ('pending','booked') AND starts_at > now();
  ELSIF TG_TABLE_NAME = 'professionals' THEN
    SELECT count(*) INTO v_n FROM public.appointments
      WHERE professional_id = NEW.id AND status IN ('pending','booked') AND starts_at > now();
  ELSE
    SELECT count(*) INTO v_n FROM public.appointments
      WHERE location_id = NEW.id AND status IN ('pending','booked') AND starts_at > now();
  END IF;

  IF v_n > 0 THEN
    RAISE EXCEPTION 'ENTITY_HAS_FUTURE_APPTS:%:%', TG_TABLE_NAME, v_n
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_service_with_appts ON public.services;
CREATE TRIGGER trg_block_service_with_appts
  BEFORE UPDATE OF is_active, deleted_at ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.block_entity_with_future_appts();

DROP TRIGGER IF EXISTS trg_block_professional_with_appts ON public.professionals;
CREATE TRIGGER trg_block_professional_with_appts
  BEFORE UPDATE OF is_active, deleted_at ON public.professionals
  FOR EACH ROW EXECUTE FUNCTION public.block_entity_with_future_appts();

DROP TRIGGER IF EXISTS trg_block_location_with_appts ON public.locations;
CREATE TRIGGER trg_block_location_with_appts
  BEFORE UPDATE OF is_active, deleted_at ON public.locations
  FOR EACH ROW EXECUTE FUNCTION public.block_entity_with_future_appts();

-- ============================================================
-- 5. Panel de admin: agregados y paginación en SQL (solo service_role)
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_list_businesses(_search text DEFAULT NULL, _limit integer DEFAULT 50, _offset integer DEFAULT 0)
RETURNS TABLE (
  id uuid, name text, slug text, plan text, owner_email text, created_at timestamptz,
  onboarding_completed boolean, deleted boolean, appts_this_month bigint, total_count bigint
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH filtered AS (
    SELECT b.*, u.email::text AS owner_email
    FROM public.businesses b
    LEFT JOIN auth.users u ON u.id = b.owner_id
    WHERE _search IS NULL OR _search = ''
       OR b.name ILIKE '%' || _search || '%'
       OR b.slug ILIKE '%' || _search || '%'
       OR u.email ILIKE '%' || _search || '%'
  )
  SELECT f.id, f.name, f.slug, f.plan, f.owner_email, f.created_at, f.onboarding_completed,
         f.deleted_at IS NOT NULL,
         (SELECT count(*) FROM public.appointments a
            WHERE a.business_id = f.id
              AND a.status IN ('pending','booked','completed')
              AND a.starts_at >= date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
              AND a.starts_at <  (date_trunc('month', now() AT TIME ZONE 'UTC') + interval '1 month') AT TIME ZONE 'UTC'),
         count(*) OVER ()
  FROM filtered f
  ORDER BY f.created_at DESC
  LIMIT greatest(_limit, 1) OFFSET greatest(_offset, 0);
$$;

CREATE OR REPLACE FUNCTION public.admin_totals()
RETURNS TABLE (businesses bigint, free bigint, pro bigint, studio bigint, preregistrations bigint, new_upgrade_requests bigint)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    count(*) FILTER (WHERE deleted_at IS NULL),
    count(*) FILTER (WHERE deleted_at IS NULL AND plan = 'free'),
    count(*) FILTER (WHERE deleted_at IS NULL AND plan = 'pro'),
    count(*) FILTER (WHERE deleted_at IS NULL AND plan = 'studio'),
    (SELECT count(*) FROM public.pro_preregistrations),
    (SELECT count(*) FROM public.upgrade_requests WHERE status = 'new')
  FROM public.businesses;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_list_businesses(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_totals() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_businesses(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_totals() TO service_role;
