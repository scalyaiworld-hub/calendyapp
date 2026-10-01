-- Roles de plataforma y primer administrador.
-- NO aplicar sin revisar.

CREATE TYPE public.app_role AS ENUM ('admin');

CREATE TABLE public.user_roles (
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Un usuario solo puede ver sus propios roles. Nadie escribe roles desde el cliente:
-- los roles se otorgan con SQL (service_role / SQL Editor).
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

CREATE POLICY "Users read own roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;

-- Primer admin. Solo funciona si esta cuenta ya existe (haber iniciado sesión al menos una vez).
-- Si todavía no existe, vuelve a ejecutar este INSERT después de iniciar sesión:
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role
FROM auth.users
WHERE lower(email) = 'jfernandezc@uni.pe'
ON CONFLICT DO NOTHING;
