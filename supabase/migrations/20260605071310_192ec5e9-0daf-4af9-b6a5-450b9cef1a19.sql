
-- Locations (sucursales)
CREATE TABLE public.locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  name text NOT NULL,
  address text,
  phone text,
  phone_country_code text,
  is_active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.locations TO authenticated;
GRANT SELECT ON public.locations TO anon;
GRANT ALL ON public.locations TO service_role;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read active locations" ON public.locations
  FOR SELECT TO anon, authenticated
  USING (deleted_at IS NULL AND is_active = true);
CREATE POLICY "Owners read locations" ON public.locations
  FOR SELECT TO authenticated USING (is_business_owner(business_id));
CREATE POLICY "Owners insert locations" ON public.locations
  FOR INSERT TO authenticated WITH CHECK (is_business_owner(business_id));
CREATE POLICY "Owners update locations" ON public.locations
  FOR UPDATE TO authenticated USING (is_business_owner(business_id));
CREATE POLICY "Owners delete locations" ON public.locations
  FOR DELETE TO authenticated USING (is_business_owner(business_id));
CREATE TRIGGER trg_locations_updated BEFORE UPDATE ON public.locations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Location hours
CREATE TABLE public.location_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time time NOT NULL,
  end_time time NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.location_hours TO authenticated;
GRANT SELECT ON public.location_hours TO anon;
GRANT ALL ON public.location_hours TO service_role;
ALTER TABLE public.location_hours ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read location hours" ON public.location_hours
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Owners manage location hours" ON public.location_hours
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.locations l WHERE l.id = location_hours.location_id AND is_business_owner(l.business_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.locations l WHERE l.id = location_hours.location_id AND is_business_owner(l.business_id)));

-- Professionals
CREATE TABLE public.professionals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  name text NOT NULL,
  phone text,
  phone_country_code text,
  avatar_url text,
  is_active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.professionals TO authenticated;
GRANT SELECT ON public.professionals TO anon;
GRANT ALL ON public.professionals TO service_role;
ALTER TABLE public.professionals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read active professionals" ON public.professionals
  FOR SELECT TO anon, authenticated USING (deleted_at IS NULL AND is_active = true);
CREATE POLICY "Owners read professionals" ON public.professionals
  FOR SELECT TO authenticated USING (is_business_owner(business_id));
CREATE POLICY "Owners insert professionals" ON public.professionals
  FOR INSERT TO authenticated WITH CHECK (is_business_owner(business_id));
CREATE POLICY "Owners update professionals" ON public.professionals
  FOR UPDATE TO authenticated USING (is_business_owner(business_id));
CREATE POLICY "Owners delete professionals" ON public.professionals
  FOR DELETE TO authenticated USING (is_business_owner(business_id));
CREATE TRIGGER trg_professionals_updated BEFORE UPDATE ON public.professionals
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Location <-> Professionals
CREATE TABLE public.location_professionals (
  location_id uuid NOT NULL,
  professional_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (location_id, professional_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.location_professionals TO authenticated;
GRANT SELECT ON public.location_professionals TO anon;
GRANT ALL ON public.location_professionals TO service_role;
ALTER TABLE public.location_professionals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read location professionals" ON public.location_professionals
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Owners manage location professionals" ON public.location_professionals
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.locations l WHERE l.id = location_professionals.location_id AND is_business_owner(l.business_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.locations l WHERE l.id = location_professionals.location_id AND is_business_owner(l.business_id)));

-- Professional <-> Services
CREATE TABLE public.professional_services (
  professional_id uuid NOT NULL,
  service_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (professional_id, service_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.professional_services TO authenticated;
GRANT SELECT ON public.professional_services TO anon;
GRANT ALL ON public.professional_services TO service_role;
ALTER TABLE public.professional_services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read professional services" ON public.professional_services
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Owners manage professional services" ON public.professional_services
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = professional_services.professional_id AND is_business_owner(p.business_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = professional_services.professional_id AND is_business_owner(p.business_id)));

-- Add location & professional to appointments (nullable for backwards compat)
ALTER TABLE public.appointments
  ADD COLUMN location_id uuid,
  ADD COLUMN professional_id uuid;
