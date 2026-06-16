
-- ============================================================
-- 0. Extensiones necesarias
-- ============================================================
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ============================================================
-- 1. Anti-doble-reserva por profesional / sucursal
-- ============================================================
ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_business_id_tstzrange_excl;

-- Si hay profesional, no puede tener dos citas activas solapadas
ALTER TABLE public.appointments
  ADD CONSTRAINT appts_no_overlap_per_professional
  EXCLUDE USING gist (
    professional_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  )
  WHERE (professional_id IS NOT NULL AND status IN ('pending','booked'));

-- Si no hay profesional pero sí sucursal, no puede haber dos citas activas solapadas en la misma sucursal
ALTER TABLE public.appointments
  ADD CONSTRAINT appts_no_overlap_per_location_when_no_pro
  EXCLUDE USING gist (
    location_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  )
  WHERE (professional_id IS NULL AND location_id IS NOT NULL AND status IN ('pending','booked'));

-- ============================================================
-- 2. Validación de plan
-- ============================================================
ALTER TABLE public.businesses
  DROP CONSTRAINT IF EXISTS businesses_plan_check;
ALTER TABLE public.businesses
  ADD CONSTRAINT businesses_plan_check CHECK (plan IN ('free','pro','studio'));

-- Tabla de límites en SQL (espejo de src/lib/plans.ts)
CREATE OR REPLACE FUNCTION public.plan_limit(_plan text, _resource text)
RETURNS integer
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE _plan
    WHEN 'free' THEN CASE _resource
      WHEN 'appointments_per_month' THEN 50
      WHEN 'locations' THEN 1
      WHEN 'professionals' THEN 3
      ELSE NULL END
    WHEN 'pro' THEN CASE _resource
      WHEN 'appointments_per_month' THEN NULL
      WHEN 'locations' THEN 3
      WHEN 'professionals' THEN NULL
      ELSE NULL END
    WHEN 'studio' THEN NULL
    ELSE NULL
  END;
$$;

-- Trigger genérico que valida límites antes de insertar
CREATE OR REPLACE FUNCTION public.enforce_plan_limits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan text;
  v_limit integer;
  v_used integer;
  v_business_id uuid;
BEGIN
  -- Bypass explícito (seeds, migraciones manuales)
  IF coalesce(current_setting('app.bypass_plan_limits', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  v_business_id := NEW.business_id;
  SELECT plan INTO v_plan FROM public.businesses WHERE id = v_business_id;
  IF v_plan IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'appointments' THEN
    v_limit := public.plan_limit(v_plan, 'appointments_per_month');
    IF v_limit IS NOT NULL THEN
      SELECT count(*) INTO v_used
      FROM public.appointments
      WHERE business_id = v_business_id
        AND status <> 'cancelled'
        AND starts_at >= date_trunc('month', now())
        AND starts_at <  date_trunc('month', now()) + interval '1 month';
      IF v_used >= v_limit THEN
        RAISE EXCEPTION 'PLAN_LIMIT_APPOINTMENTS:%/%/%', v_plan, v_used, v_limit
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;

  ELSIF TG_TABLE_NAME = 'locations' THEN
    v_limit := public.plan_limit(v_plan, 'locations');
    IF v_limit IS NOT NULL THEN
      SELECT count(*) INTO v_used
      FROM public.locations
      WHERE business_id = v_business_id AND deleted_at IS NULL;
      IF v_used >= v_limit THEN
        RAISE EXCEPTION 'PLAN_LIMIT_LOCATIONS:%/%/%', v_plan, v_used, v_limit
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;

  ELSIF TG_TABLE_NAME = 'professionals' THEN
    v_limit := public.plan_limit(v_plan, 'professionals');
    IF v_limit IS NOT NULL THEN
      SELECT count(*) INTO v_used
      FROM public.professionals
      WHERE business_id = v_business_id AND deleted_at IS NULL;
      IF v_used >= v_limit THEN
        RAISE EXCEPTION 'PLAN_LIMIT_PROFESSIONALS:%/%/%', v_plan, v_used, v_limit
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_plan_limits_appts ON public.appointments;
CREATE TRIGGER trg_enforce_plan_limits_appts
  BEFORE INSERT ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_limits();

DROP TRIGGER IF EXISTS trg_enforce_plan_limits_locs ON public.locations;
CREATE TRIGGER trg_enforce_plan_limits_locs
  BEFORE INSERT ON public.locations
  FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_limits();

DROP TRIGGER IF EXISTS trg_enforce_plan_limits_pros ON public.professionals;
CREATE TRIGGER trg_enforce_plan_limits_pros
  BEFORE INSERT ON public.professionals
  FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_limits();

-- ============================================================
-- 3. Validación de transiciones de estado y edición pasada
-- ============================================================
-- Matriz permitida:
--   pending   -> booked, completed, cancelled, no_show
--   booked    -> completed, cancelled, no_show
--   completed -> (terminal)
--   cancelled -> (terminal)
--   no_show   -> (terminal)
CREATE OR REPLACE FUNCTION public.validate_appointment_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF coalesce(current_setting('app.bypass_appt_guard', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  -- Bloquear cambio de estado desde terminal
  IF OLD.status IN ('completed','cancelled','no_show')
     AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'APPT_STATUS_TERMINAL:%->%', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  -- Transiciones válidas desde pending/booked
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status = 'pending'
       AND NEW.status NOT IN ('booked','completed','cancelled','no_show') THEN
      RAISE EXCEPTION 'APPT_STATUS_INVALID:%->%', OLD.status, NEW.status
        USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.status = 'booked'
       AND NEW.status NOT IN ('completed','cancelled','no_show') THEN
      RAISE EXCEPTION 'APPT_STATUS_INVALID:%->%', OLD.status, NEW.status
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Bloquear editar fechas de citas que ya pasaron
  IF OLD.starts_at < now()
     AND (NEW.starts_at IS DISTINCT FROM OLD.starts_at
          OR NEW.ends_at IS DISTINCT FROM OLD.ends_at) THEN
    RAISE EXCEPTION 'APPT_PAST_LOCKED'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_appt_update ON public.appointments;
CREATE TRIGGER trg_validate_appt_update
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.validate_appointment_update();

-- ============================================================
-- 4. Sincronización de contadores de clients
-- ============================================================
CREATE OR REPLACE FUNCTION public.recalc_client_counters(_client_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.clients c SET
    no_show_count = COALESCE((
      SELECT count(*) FROM public.appointments a
      WHERE a.client_id = c.id AND a.status = 'no_show'
    ), 0),
    total_appointments = COALESCE((
      SELECT count(*) FROM public.appointments a
      WHERE a.client_id = c.id AND a.status = 'completed'
    ), 0),
    last_visit_at = (
      SELECT max(a.starts_at) FROM public.appointments a
      WHERE a.client_id = c.id AND a.status = 'completed'
    )
  WHERE c.id = _client_id;
$$;

CREATE OR REPLACE FUNCTION public.sync_client_counters_from_appt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.recalc_client_counters(NEW.client_id);
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM public.recalc_client_counters(NEW.client_id);
    IF NEW.client_id IS DISTINCT FROM OLD.client_id THEN
      PERFORM public.recalc_client_counters(OLD.client_id);
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.recalc_client_counters(OLD.client_id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_client_counters ON public.appointments;
CREATE TRIGGER trg_sync_client_counters
  AFTER INSERT OR UPDATE OR DELETE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.sync_client_counters_from_appt();

-- Backfill inicial
UPDATE public.clients c SET
  no_show_count = COALESCE((
    SELECT count(*) FROM public.appointments a
    WHERE a.client_id = c.id AND a.status = 'no_show'
  ), 0),
  total_appointments = COALESCE((
    SELECT count(*) FROM public.appointments a
    WHERE a.client_id = c.id AND a.status = 'completed'
  ), 0),
  last_visit_at = (
    SELECT max(a.starts_at) FROM public.appointments a
    WHERE a.client_id = c.id AND a.status = 'completed'
  );

-- ============================================================
-- 5. Normalización y deduplicación de clients
-- ============================================================
CREATE OR REPLACE FUNCTION public.normalize_phone(p text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN p IS NULL THEN NULL
    ELSE regexp_replace(p, '[^0-9+]', '', 'g')
  END;
$$;

CREATE OR REPLACE FUNCTION public.normalize_client_phone()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.phone IS NOT NULL THEN
    NEW.phone := public.normalize_phone(NEW.phone);
  END IF;
  IF NEW.phone_country_code IS NOT NULL THEN
    NEW.phone_country_code := public.normalize_phone(NEW.phone_country_code);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_client_phone ON public.clients;
CREATE TRIGGER trg_normalize_client_phone
  BEFORE INSERT OR UPDATE OF phone, phone_country_code ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.normalize_client_phone();

-- Normalizar datos existentes antes de cambiar el índice
UPDATE public.clients SET phone = public.normalize_phone(phone) WHERE phone IS NOT NULL;
UPDATE public.clients SET phone_country_code = public.normalize_phone(phone_country_code) WHERE phone_country_code IS NOT NULL;

-- Nuevo índice de unicidad por (negocio, país, teléfono), ignorando borrados
ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_business_id_phone_key;
DROP INDEX IF EXISTS public.idx_clients_business_phone;

CREATE UNIQUE INDEX IF NOT EXISTS clients_unique_phone_per_business
  ON public.clients (business_id, COALESCE(phone_country_code, ''), phone)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_clients_business_phone
  ON public.clients (business_id, phone)
  WHERE deleted_at IS NULL;
