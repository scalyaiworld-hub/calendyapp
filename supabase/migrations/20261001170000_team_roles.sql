-- Roles y permisos por staff (módulo "rolesPermissions", plan Studio).
-- NO aplicar sin revisar: agrega políticas RLS a casi todas las tablas del negocio.
-- Va después de 20261001150000_restrict_anon_reads.sql.
--
-- Modelo:
--   * El dueño sigue siendo businesses.owner_id (acceso total, no tiene fila de miembro).
--   * Miembros (business_members) con rol:
--       manager       -> todo lo operativo y el catálogo; NO cambia ajustes, plan ni equipo.
--       reception     -> agenda, citas y clientes; ve el catálogo, no lo edita.
--       professional  -> solo SUS citas (professional_id) y los clientes de esas citas.
--   * Las políticas nuevas se SUMAN a las del dueño (RLS permisivo = OR); no se toca ninguna existente.
--   * Los miembros solo cuentan mientras el negocio esté en plan 'studio' (se comprueba en la función
--     has_business_role): si baja de plan pierden el acceso sin borrar nada.
--   * Altas, bajas y cambios de rol se hacen solo desde el servidor (service_role).

CREATE TYPE public.business_role AS ENUM ('manager', 'reception', 'professional');

-- ============================================================
-- Tablas
-- ============================================================
CREATE TABLE public.business_members (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role            public.business_role NOT NULL,
  professional_id uuid REFERENCES public.professionals(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, user_id),
  -- Solo el rol 'professional' lleva profesional asociado, y siempre.
  CHECK ((role = 'professional') = (professional_id IS NOT NULL))
);
CREATE INDEX business_members_user_idx ON public.business_members (user_id);

CREATE TABLE public.business_invites (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  email           text NOT NULL CHECK (length(email) BETWEEN 5 AND 254),
  role            public.business_role NOT NULL,
  professional_id uuid REFERENCES public.professionals(id) ON DELETE CASCADE,
  invited_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK ((role = 'professional') = (professional_id IS NOT NULL))
);
CREATE UNIQUE INDEX business_invites_email_idx ON public.business_invites (business_id, lower(email));

-- El profesional asociado debe ser del mismo negocio (miembros e invitaciones).
CREATE OR REPLACE FUNCTION public.check_member_professional()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.professional_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.professionals p
    WHERE p.id = NEW.professional_id AND p.business_id = NEW.business_id AND p.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'El profesional no pertenece a este negocio' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER business_members_check_professional
  BEFORE INSERT OR UPDATE ON public.business_members
  FOR EACH ROW EXECUTE FUNCTION public.check_member_professional();
CREATE TRIGGER business_invites_check_professional
  BEFORE INSERT OR UPDATE ON public.business_invites
  FOR EACH ROW EXECUTE FUNCTION public.check_member_professional();

ALTER TABLE public.business_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_invites ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.business_members FROM anon, authenticated;
REVOKE ALL ON public.business_invites FROM anon, authenticated;
GRANT SELECT ON public.business_members TO authenticated;
GRANT ALL ON public.business_members, public.business_invites TO service_role;

-- Cada quien ve sus membresías; el dueño ve las de su negocio. Invitaciones: solo servidor (sin políticas).
CREATE POLICY "Members read own membership, owners read all"
  ON public.business_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_business_owner(business_id));

-- ============================================================
-- Funciones de permiso (SECURITY DEFINER para no recursar en RLS)
-- ============================================================
CREATE OR REPLACE FUNCTION public.has_business_role(_business_id uuid, _roles public.business_role[])
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.business_members m
    JOIN public.businesses b ON b.id = m.business_id
    WHERE m.business_id = _business_id
      AND m.user_id = auth.uid()
      AND m.role = ANY (_roles)
      AND b.deleted_at IS NULL
      AND b.plan = 'studio'
  );
$$;

CREATE OR REPLACE FUNCTION public.my_professional_id(_business_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT m.professional_id
  FROM public.business_members m
  JOIN public.businesses b ON b.id = m.business_id
  WHERE m.business_id = _business_id
    AND m.user_id = auth.uid()
    AND m.role = 'professional'
    AND b.deleted_at IS NULL
    AND b.plan = 'studio';
$$;

REVOKE EXECUTE ON FUNCTION public.has_business_role(uuid, public.business_role[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.my_professional_id(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_business_role(uuid, public.business_role[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_professional_id(uuid) TO authenticated, service_role;

-- ============================================================
-- Políticas (se suman a las del dueño)
-- ============================================================

-- businesses: los miembros leen su negocio (no lo editan).
CREATE POLICY "Members read business"
  ON public.businesses FOR SELECT TO authenticated
  USING (public.has_business_role(id, ARRAY['manager', 'reception', 'professional']::public.business_role[]));

-- Catálogo con business_id: todos los miembros leen, el manager edita.
CREATE POLICY "Members read locations" ON public.locations FOR SELECT TO authenticated
  USING (public.has_business_role(business_id, ARRAY['manager', 'reception', 'professional']::public.business_role[]));
CREATE POLICY "Managers manage locations" ON public.locations FOR ALL TO authenticated
  USING (public.has_business_role(business_id, ARRAY['manager']::public.business_role[]))
  WITH CHECK (public.has_business_role(business_id, ARRAY['manager']::public.business_role[]));

CREATE POLICY "Members read professionals" ON public.professionals FOR SELECT TO authenticated
  USING (public.has_business_role(business_id, ARRAY['manager', 'reception', 'professional']::public.business_role[]));
CREATE POLICY "Managers manage professionals" ON public.professionals FOR ALL TO authenticated
  USING (public.has_business_role(business_id, ARRAY['manager']::public.business_role[]))
  WITH CHECK (public.has_business_role(business_id, ARRAY['manager']::public.business_role[]));

CREATE POLICY "Members read services" ON public.services FOR SELECT TO authenticated
  USING (public.has_business_role(business_id, ARRAY['manager', 'reception', 'professional']::public.business_role[]));
CREATE POLICY "Managers manage services" ON public.services FOR ALL TO authenticated
  USING (public.has_business_role(business_id, ARRAY['manager']::public.business_role[]))
  WITH CHECK (public.has_business_role(business_id, ARRAY['manager']::public.business_role[]));

CREATE POLICY "Members read availability rules" ON public.availability_rules FOR SELECT TO authenticated
  USING (public.has_business_role(business_id, ARRAY['manager', 'reception', 'professional']::public.business_role[]));
CREATE POLICY "Managers manage availability rules" ON public.availability_rules FOR ALL TO authenticated
  USING (public.has_business_role(business_id, ARRAY['manager']::public.business_role[]))
  WITH CHECK (public.has_business_role(business_id, ARRAY['manager']::public.business_role[]));

-- Tablas puente: heredan el negocio de su padre.
CREATE POLICY "Members read location hours" ON public.location_hours FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.locations l WHERE l.id = location_hours.location_id
    AND public.has_business_role(l.business_id, ARRAY['manager', 'reception', 'professional']::public.business_role[])));
CREATE POLICY "Managers manage location hours" ON public.location_hours FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.locations l WHERE l.id = location_hours.location_id
    AND public.has_business_role(l.business_id, ARRAY['manager']::public.business_role[])))
  WITH CHECK (EXISTS (SELECT 1 FROM public.locations l WHERE l.id = location_hours.location_id
    AND public.has_business_role(l.business_id, ARRAY['manager']::public.business_role[])));

CREATE POLICY "Members read location professionals" ON public.location_professionals FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.locations l WHERE l.id = location_professionals.location_id
    AND public.has_business_role(l.business_id, ARRAY['manager', 'reception', 'professional']::public.business_role[])));
CREATE POLICY "Managers manage location professionals" ON public.location_professionals FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.locations l WHERE l.id = location_professionals.location_id
    AND public.has_business_role(l.business_id, ARRAY['manager']::public.business_role[])))
  WITH CHECK (EXISTS (SELECT 1 FROM public.locations l WHERE l.id = location_professionals.location_id
    AND public.has_business_role(l.business_id, ARRAY['manager']::public.business_role[])));

CREATE POLICY "Members read professional services" ON public.professional_services FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = professional_services.professional_id
    AND public.has_business_role(p.business_id, ARRAY['manager', 'reception', 'professional']::public.business_role[])));
CREATE POLICY "Managers manage professional services" ON public.professional_services FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = professional_services.professional_id
    AND public.has_business_role(p.business_id, ARRAY['manager']::public.business_role[])))
  WITH CHECK (EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = professional_services.professional_id
    AND public.has_business_role(p.business_id, ARRAY['manager']::public.business_role[])));

-- Clientes: recepción y manager gestionan; el profesional solo lee los de sus citas.
CREATE POLICY "Front desk manage clients" ON public.clients FOR ALL TO authenticated
  USING (public.has_business_role(business_id, ARRAY['manager', 'reception']::public.business_role[]))
  WITH CHECK (public.has_business_role(business_id, ARRAY['manager', 'reception']::public.business_role[]));
CREATE POLICY "Professionals read their clients" ON public.clients FOR SELECT TO authenticated
  USING (
    public.has_business_role(business_id, ARRAY['professional']::public.business_role[])
    AND EXISTS (
      SELECT 1 FROM public.appointments a
      WHERE a.client_id = clients.id
        AND a.professional_id = public.my_professional_id(clients.business_id)
    )
  );

-- Citas: recepción y manager gestionan; el profesional lee y actualiza solo las suyas.
CREATE POLICY "Front desk manage appointments" ON public.appointments FOR ALL TO authenticated
  USING (public.has_business_role(business_id, ARRAY['manager', 'reception']::public.business_role[]))
  WITH CHECK (public.has_business_role(business_id, ARRAY['manager', 'reception']::public.business_role[]));
CREATE POLICY "Professionals read own appointments" ON public.appointments FOR SELECT TO authenticated
  USING (
    public.has_business_role(business_id, ARRAY['professional']::public.business_role[])
    AND professional_id = public.my_professional_id(business_id)
  );
CREATE POLICY "Professionals update own appointments" ON public.appointments FOR UPDATE TO authenticated
  USING (
    public.has_business_role(business_id, ARRAY['professional']::public.business_role[])
    AND professional_id = public.my_professional_id(business_id)
  )
  WITH CHECK (
    public.has_business_role(business_id, ARRAY['professional']::public.business_role[])
    AND professional_id = public.my_professional_id(business_id)
  );

-- Un profesional solo puede cambiar el estado, las notas y los datos de cancelación de su cita
-- (no mover horario, cliente, servicio ni reasignarla). service_role y el resto de roles no se ven afectados.
CREATE OR REPLACE FUNCTION public.limit_professional_appointment_updates()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF public.has_business_role(OLD.business_id, ARRAY['professional']::public.business_role[]) THEN
    IF (NEW.business_id, NEW.client_id, NEW.service_id, NEW.professional_id, NEW.location_id, NEW.starts_at, NEW.ends_at, NEW.source)
       IS DISTINCT FROM
       (OLD.business_id, OLD.client_id, OLD.service_id, OLD.professional_id, OLD.location_id, OLD.starts_at, OLD.ends_at, OLD.source)
    THEN
      RAISE EXCEPTION 'Un profesional solo puede cambiar el estado y las notas de su cita' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER appointments_limit_professional_updates
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.limit_professional_appointment_updates();

-- Auditoría: la ve el manager.
CREATE POLICY "Managers read audit" ON public.audit_log FOR SELECT TO authenticated
  USING (business_id IS NOT NULL AND public.has_business_role(business_id, ARRAY['manager']::public.business_role[]));
