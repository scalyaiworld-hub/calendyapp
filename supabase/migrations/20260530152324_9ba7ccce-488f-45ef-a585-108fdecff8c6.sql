
-- Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ==========================================
-- BUSINESSES
-- ==========================================
CREATE TABLE public.businesses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL CHECK (length(name) BETWEEN 2 AND 80),
  slug        text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]+$' AND length(slug) BETWEEN 3 AND 60),
  owner_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  timezone    text NOT NULL DEFAULT 'America/Lima',
  phone       text,
  logo_url    text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);

CREATE INDEX idx_businesses_owner ON public.businesses(owner_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_businesses_slug  ON public.businesses(slug)     WHERE deleted_at IS NULL;

GRANT SELECT ON public.businesses TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.businesses TO authenticated;
GRANT ALL ON public.businesses TO service_role;

ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read businesses by slug"
  ON public.businesses FOR SELECT TO anon, authenticated
  USING (deleted_at IS NULL);

CREATE POLICY "Owners can insert their business"
  ON public.businesses FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owners can update their business"
  ON public.businesses FOR UPDATE TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "Owners can delete their business"
  ON public.businesses FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- Helper: is user owner of a given business
CREATE OR REPLACE FUNCTION public.is_business_owner(_business_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.businesses
    WHERE id = _business_id AND owner_id = auth.uid() AND deleted_at IS NULL
  );
$$;

-- ==========================================
-- SERVICES
-- ==========================================
CREATE TABLE public.services (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id       uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name              text NOT NULL CHECK (length(name) BETWEEN 2 AND 60),
  price_cents       integer NOT NULL CHECK (price_cents >= 0),
  duration_minutes  integer NOT NULL CHECK (duration_minutes BETWEEN 5 AND 480),
  description       text,
  is_active         boolean NOT NULL DEFAULT true,
  display_order     integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);

CREATE INDEX idx_services_business_active
  ON public.services(business_id, is_active) WHERE deleted_at IS NULL;

GRANT SELECT ON public.services TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.services TO authenticated;
GRANT ALL ON public.services TO service_role;

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read active services"
  ON public.services FOR SELECT TO anon, authenticated
  USING (deleted_at IS NULL AND is_active = true);

CREATE POLICY "Owners can read all their services"
  ON public.services FOR SELECT TO authenticated
  USING (public.is_business_owner(business_id));

CREATE POLICY "Owners manage services - insert"
  ON public.services FOR INSERT TO authenticated
  WITH CHECK (public.is_business_owner(business_id));

CREATE POLICY "Owners manage services - update"
  ON public.services FOR UPDATE TO authenticated
  USING (public.is_business_owner(business_id));

CREATE POLICY "Owners manage services - delete"
  ON public.services FOR DELETE TO authenticated
  USING (public.is_business_owner(business_id));

-- ==========================================
-- CLIENTS
-- ==========================================
CREATE TABLE public.clients (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id         uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name                text NOT NULL CHECK (length(name) BETWEEN 2 AND 80),
  phone               text NOT NULL CHECK (phone ~ '^\+?[0-9]{7,15}$'),
  email               text,
  notes               text,
  no_show_count       integer NOT NULL DEFAULT 0,
  total_appointments  integer NOT NULL DEFAULT 0,
  last_visit_at       timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz,
  UNIQUE (business_id, phone)
);

CREATE INDEX idx_clients_business_phone
  ON public.clients(business_id, phone) WHERE deleted_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners read clients"
  ON public.clients FOR SELECT TO authenticated
  USING (public.is_business_owner(business_id));

CREATE POLICY "Owners manage clients - insert"
  ON public.clients FOR INSERT TO authenticated
  WITH CHECK (public.is_business_owner(business_id));

CREATE POLICY "Owners manage clients - update"
  ON public.clients FOR UPDATE TO authenticated
  USING (public.is_business_owner(business_id));

CREATE POLICY "Owners manage clients - delete"
  ON public.clients FOR DELETE TO authenticated
  USING (public.is_business_owner(business_id));

-- ==========================================
-- AVAILABILITY RULES
-- ==========================================
CREATE TABLE public.availability_rules (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  day_of_week  smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time   time NOT NULL,
  end_time     time NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (end_time > start_time)
);

CREATE INDEX idx_availability_business ON public.availability_rules(business_id, day_of_week);

GRANT SELECT ON public.availability_rules TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.availability_rules TO authenticated;
GRANT ALL ON public.availability_rules TO service_role;

ALTER TABLE public.availability_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read availability"
  ON public.availability_rules FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "Owners manage availability - insert"
  ON public.availability_rules FOR INSERT TO authenticated
  WITH CHECK (public.is_business_owner(business_id));

CREATE POLICY "Owners manage availability - update"
  ON public.availability_rules FOR UPDATE TO authenticated
  USING (public.is_business_owner(business_id));

CREATE POLICY "Owners manage availability - delete"
  ON public.availability_rules FOR DELETE TO authenticated
  USING (public.is_business_owner(business_id));

-- ==========================================
-- APPOINTMENTS
-- ==========================================
CREATE TYPE public.appointment_status AS ENUM (
  'pending','booked','completed','cancelled','no_show'
);

CREATE TYPE public.appointment_source AS ENUM (
  'manual','booking_page','chat_ai','whatsapp'
);

CREATE TABLE public.appointments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id        uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  client_id          uuid NOT NULL REFERENCES public.clients(id),
  service_id         uuid NOT NULL REFERENCES public.services(id),
  starts_at          timestamptz NOT NULL,
  ends_at            timestamptz NOT NULL,
  status             public.appointment_status NOT NULL DEFAULT 'booked',
  source             public.appointment_source NOT NULL DEFAULT 'manual',
  notes              text,
  cancelled_reason   text,
  cancelled_at       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  -- Anti double-booking: no two ACTIVE appointments overlap in the same business
  EXCLUDE USING gist (
    business_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  ) WHERE (status IN ('pending','booked'))
);

CREATE INDEX idx_appts_business_starts ON public.appointments(business_id, starts_at);
CREATE INDEX idx_appts_client          ON public.appointments(client_id);
CREATE INDEX idx_appts_status          ON public.appointments(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointments TO authenticated;
GRANT ALL ON public.appointments TO service_role;

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners read appointments"
  ON public.appointments FOR SELECT TO authenticated
  USING (public.is_business_owner(business_id));

CREATE POLICY "Owners manage appointments - insert"
  ON public.appointments FOR INSERT TO authenticated
  WITH CHECK (public.is_business_owner(business_id));

CREATE POLICY "Owners manage appointments - update"
  ON public.appointments FOR UPDATE TO authenticated
  USING (public.is_business_owner(business_id));

CREATE POLICY "Owners manage appointments - delete"
  ON public.appointments FOR DELETE TO authenticated
  USING (public.is_business_owner(business_id));

-- ==========================================
-- AUDIT LOG
-- ==========================================
CREATE TABLE public.audit_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   uuid REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id       uuid,
  action        text NOT NULL,
  entity_type   text NOT NULL,
  entity_id     uuid,
  metadata      jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_business_created ON public.audit_log(business_id, created_at DESC);

GRANT SELECT, INSERT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners read audit"
  ON public.audit_log FOR SELECT TO authenticated
  USING (business_id IS NULL OR public.is_business_owner(business_id));

-- ==========================================
-- updated_at triggers
-- ==========================================
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_businesses_updated
  BEFORE UPDATE ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER trg_services_updated
  BEFORE UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER trg_clients_updated
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER trg_appts_updated
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
