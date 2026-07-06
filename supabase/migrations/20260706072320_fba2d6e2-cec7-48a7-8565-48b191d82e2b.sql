-- Prevent anon from reading client_id (and other identifying columns) on appointments.
-- The public availability policy only needs time/status columns to compute free slots.
REVOKE SELECT ON public.appointments FROM anon;
GRANT SELECT (id, business_id, service_id, location_id, professional_id, starts_at, ends_at, status, source, created_at) ON public.appointments TO anon;

-- Tighten the public insert policy so an anon caller cannot attach an appointment
-- to a client_id belonging to another business.
DROP POLICY IF EXISTS "Public can create pending appointments" ON public.appointments;
CREATE POLICY "Public can create pending appointments"
ON public.appointments
FOR INSERT
TO anon, authenticated
WITH CHECK (
  status = 'pending'::appointment_status
  AND source = 'booking_page'::appointment_source
  AND EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.id = appointments.business_id AND b.deleted_at IS NULL
  )
  AND EXISTS (
    SELECT 1 FROM public.services s
    WHERE s.id = appointments.service_id
      AND s.business_id = appointments.business_id
      AND s.is_active = true
      AND s.deleted_at IS NULL
  )
  AND EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = appointments.client_id
      AND c.business_id = appointments.business_id
      AND c.deleted_at IS NULL
  )
);