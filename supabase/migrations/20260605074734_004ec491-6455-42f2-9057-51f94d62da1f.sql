CREATE TABLE public.pro_preregistrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre TEXT NOT NULL,
  email TEXT NOT NULL,
  negocio TEXT,
  telefono TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
GRANT INSERT ON public.pro_preregistrations TO anon, authenticated;
GRANT ALL ON public.pro_preregistrations TO service_role;
ALTER TABLE public.pro_preregistrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can preregister" ON public.pro_preregistrations FOR INSERT TO anon, authenticated WITH CHECK (true);