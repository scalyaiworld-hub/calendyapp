-- Solicitudes de upgrade de plan (antes el formulario de /dashboard/planes solo simulaba el envío).
-- NO aplicar sin revisar. Solo el servidor (service_role) lee y escribe esta tabla.

CREATE TABLE public.upgrade_requests (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan        text NOT NULL CHECK (plan IN ('pro', 'studio')),
  name        text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 100),
  email       text NOT NULL CHECK (length(email) BETWEEN 5 AND 254),
  phone       text CHECK (phone IS NULL OR length(phone) <= 40),
  industry    text NOT NULL CHECK (length(industry) <= 80),
  message     text CHECK (message IS NULL OR length(message) <= 800),
  details     jsonb NOT NULL DEFAULT '{}'::jsonb,
  status      text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'won', 'lost')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX upgrade_requests_created_at_idx ON public.upgrade_requests (created_at DESC);
CREATE INDEX upgrade_requests_business_plan_idx ON public.upgrade_requests (business_id, plan, created_at DESC);

ALTER TABLE public.upgrade_requests ENABLE ROW LEVEL SECURITY;

-- Sin políticas ni grants para anon/authenticated: el acceso es solo vía server functions.
REVOKE ALL ON public.upgrade_requests FROM anon, authenticated;
GRANT ALL ON public.upgrade_requests TO service_role;
