-- Reglas de negocio P1 (informe de mejora de lógica de negocio).
-- NO aplicar sin revisar: reemplaza triggers de límites y estados de citas.
--
-- 1. Límites de plan coherentes: recursos ACTIVOS, mes en la zona horaria del
--    negocio, y también al reactivar o reprogramar (no solo en INSERT).
-- 2. Módulos de plan: la marca personalizada exige el módulo `branding`.
-- 3. No se puede cerrar (completed / no_show) una cita que aún no empezó.
-- 4. Precio congelado en la cita y estadísticas calculadas en SQL.

-- ============================================================
-- 1. Límites de plan
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
    -- Una cita cancelada no consume cupo.
    IF NEW.status = 'cancelled' THEN
      RETURN NEW;
    END IF;

    v_limit := public.plan_limit(v_plan, 'appointments_per_month');
    IF v_limit IS NULL THEN
      RETURN NEW;
    END IF;

    -- El cupo es del mes de la cita (en la zona del negocio), no del mes actual.
    v_start := date_trunc('month', NEW.starts_at AT TIME ZONE v_tz) AT TIME ZONE v_tz;
    v_end := (date_trunc('month', NEW.starts_at AT TIME ZONE v_tz) + interval '1 month') AT TIME ZONE v_tz;

    -- Al reprogramar dentro del mismo mes no se consume cupo adicional.
    IF TG_OP = 'UPDATE'
       AND OLD.status <> 'cancelled'
       AND OLD.starts_at >= v_start AND OLD.starts_at < v_end THEN
      RETURN NEW;
    END IF;

    SELECT count(*) INTO v_used
    FROM public.appointments
    WHERE business_id = NEW.business_id
      AND id <> NEW.id
      AND status <> 'cancelled'
      AND starts_at >= v_start
      AND starts_at < v_end;
    IF v_used >= v_limit THEN
      RAISE EXCEPTION 'PLAN_LIMIT_APPOINTMENTS:%/%/%', v_plan, v_used, v_limit
        USING ERRCODE = 'check_violation';
    END IF;

  ELSIF TG_TABLE_NAME = 'locations' THEN
    -- Solo cuentan (y solo se validan) las sucursales activas.
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

DROP TRIGGER IF EXISTS trg_enforce_plan_limits_appts_upd ON public.appointments;
CREATE TRIGGER trg_enforce_plan_limits_appts_upd
  BEFORE UPDATE OF starts_at, status ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_limits();

DROP TRIGGER IF EXISTS trg_enforce_plan_limits_locs_upd ON public.locations;
CREATE TRIGGER trg_enforce_plan_limits_locs_upd
  BEFORE UPDATE OF is_active, deleted_at ON public.locations
  FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_limits();

DROP TRIGGER IF EXISTS trg_enforce_plan_limits_pros_upd ON public.professionals;
CREATE TRIGGER trg_enforce_plan_limits_pros_upd
  BEFORE UPDATE OF is_active, deleted_at ON public.professionals
  FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_limits();

-- ============================================================
-- 2. Módulos de plan (espejo de src/lib/plans.ts)
-- ============================================================
CREATE OR REPLACE FUNCTION public.plan_has_module(_plan text, _module text)
RETURNS boolean
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE _module
    WHEN 'publicLink' THEN true
    WHEN 'reminders' THEN _plan IN ('pro', 'studio')
    WHEN 'branding' THEN _plan IN ('pro', 'studio')
    WHEN 'advancedMetrics' THEN _plan IN ('pro', 'studio')
    WHEN 'prioritySupport' THEN _plan IN ('pro', 'studio')
    WHEN 'aiChat' THEN _plan = 'studio'
    WHEN 'rolesPermissions' THEN _plan = 'studio'
    WHEN 'integrations' THEN _plan = 'studio'
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_plan_modules()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF coalesce(current_setting('app.bypass_plan_limits', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  IF public.plan_has_module(NEW.plan, 'branding') THEN
    RETURN NEW;
  END IF;

  -- Sin el módulo solo se permite limpiar la marca (volver a los valores por defecto).
  IF (NEW.brand_primary IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.brand_primary IS DISTINCT FROM OLD.brand_primary))
     OR (NEW.brand_background IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.brand_background IS DISTINCT FROM OLD.brand_background))
     OR (NEW.brand_font IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.brand_font IS DISTINCT FROM OLD.brand_font)) THEN
    RAISE EXCEPTION 'PLAN_MODULE_BRANDING:%', NEW.plan
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_plan_modules ON public.businesses;
CREATE TRIGGER trg_enforce_plan_modules
  BEFORE INSERT OR UPDATE OF brand_primary, brand_background, brand_font ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_modules();

-- ============================================================
-- 3. No cerrar citas que aún no empezaron
-- ============================================================
CREATE OR REPLACE FUNCTION public.validate_appointment_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF coalesce(current_setting('app.bypass_appt_guard', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  IF OLD.status IN ('completed','cancelled','no_show')
     AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'APPT_STATUS_TERMINAL:%->%', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

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

    -- Completar o marcar no-show solo tiene sentido cuando la cita ya empezó.
    IF NEW.status IN ('completed','no_show') AND NEW.starts_at > now() THEN
      RAISE EXCEPTION 'APPT_FUTURE_CLOSE:%', NEW.status
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF OLD.starts_at < now()
     AND (NEW.starts_at IS DISTINCT FROM OLD.starts_at
          OR NEW.ends_at IS DISTINCT FROM OLD.ends_at) THEN
    RAISE EXCEPTION 'APPT_PAST_LOCKED'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================
-- 4. Precio congelado en la cita + estadísticas en SQL
-- ============================================================
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS price_cents integer CHECK (price_cents IS NULL OR price_cents >= 0);

-- Backfill sin disparar la guarda de citas ni cambiar el historial de estados.
SELECT set_config('app.bypass_appt_guard', 'on', true);
SELECT set_config('app.bypass_plan_limits', 'on', true);
UPDATE public.appointments a
SET price_cents = s.price_cents
FROM public.services s
WHERE s.id = a.service_id AND a.price_cents IS NULL;
SELECT set_config('app.bypass_appt_guard', 'off', true);
SELECT set_config('app.bypass_plan_limits', 'off', true);

CREATE OR REPLACE FUNCTION public.set_appointment_price()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.price_cents IS NULL THEN
      SELECT price_cents INTO NEW.price_cents FROM public.services WHERE id = NEW.service_id;
    END IF;
  ELSIF NEW.service_id IS DISTINCT FROM OLD.service_id AND OLD.status <> 'completed' THEN
    -- Si se cambia el servicio de una cita abierta, se re-calcula el precio.
    SELECT price_cents INTO NEW.price_cents FROM public.services WHERE id = NEW.service_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_appointment_price ON public.appointments;
CREATE TRIGGER trg_set_appointment_price
  BEFORE INSERT OR UPDATE OF service_id ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.set_appointment_price();

-- Hoy / pendientes / ingresos del negocio, con el "hoy" de la zona del negocio.
-- SECURITY INVOKER: RLS de appointments limita el cálculo al dueño.
CREATE OR REPLACE FUNCTION public.appointment_stats(_business_id uuid)
RETURNS TABLE (today_count bigint, pending_count bigint, completed_revenue bigint)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  WITH b AS (
    SELECT coalesce(timezone, 'America/Lima') AS tz FROM public.businesses WHERE id = _business_id
  ),
  bounds AS (
    SELECT
      date_trunc('day', now() AT TIME ZONE tz) AT TIME ZONE tz AS s,
      (date_trunc('day', now() AT TIME ZONE tz) + interval '1 day') AT TIME ZONE tz AS e
    FROM b
  )
  SELECT
    (SELECT count(*) FROM public.appointments a, bounds
       WHERE a.business_id = _business_id AND a.status <> 'cancelled'
         AND a.starts_at >= bounds.s AND a.starts_at < bounds.e),
    (SELECT count(*) FROM public.appointments a
       WHERE a.business_id = _business_id AND a.status = 'pending'),
    (SELECT coalesce(sum(coalesce(a.price_cents, s.price_cents)), 0)::bigint
       FROM public.appointments a JOIN public.services s ON s.id = a.service_id
       WHERE a.business_id = _business_id AND a.status = 'completed');
$$;

REVOKE EXECUTE ON FUNCTION public.appointment_stats(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.appointment_stats(uuid) TO authenticated, service_role;
