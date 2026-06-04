
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS whatsapp_country_code TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_number TEXT,
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_step SMALLINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS industry TEXT;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS phone_country_code TEXT;

CREATE POLICY "Public can create clients for booking"
  ON public.clients FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND b.deleted_at IS NULL)
  );

CREATE POLICY "Public can create pending appointments"
  ON public.appointments FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    status = 'pending'
    AND source = 'booking_page'
    AND EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND b.deleted_at IS NULL)
    AND EXISTS (
      SELECT 1 FROM public.services s
      WHERE s.id = service_id AND s.business_id = appointments.business_id
        AND s.is_active = true AND s.deleted_at IS NULL
    )
  );

CREATE POLICY "Public can read appointments for availability"
  ON public.appointments FOR SELECT
  TO anon, authenticated
  USING (
    status IN ('pending','booked','completed')
    AND EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND b.deleted_at IS NULL)
  );

GRANT INSERT ON public.clients TO anon;
GRANT INSERT, SELECT ON public.appointments TO anon;
