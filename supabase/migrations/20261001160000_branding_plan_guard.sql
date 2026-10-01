-- Marca personalizada (módulo "branding", planes Pro y Studio) aplicada también en la base:
-- un negocio Free no puede guardar colores ni tipografía propios aunque llame a la API directamente.
-- NO aplicar sin revisar. Mantén la lista de planes sincronizada con src/lib/plans.ts.
--
-- Permite: dejar la marca igual, o ponerla en NULL (restablecer). Los negocios Free que ya tenían
-- marca la conservan en la base; la app deja de mostrarla mientras no tengan el módulo.

CREATE OR REPLACE FUNCTION public.enforce_branding_plan()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  changed boolean;
BEGIN
  IF NEW.plan IN ('pro', 'studio') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    changed := NEW.brand_primary IS NOT NULL OR NEW.brand_background IS NOT NULL OR NEW.brand_font IS NOT NULL;
  ELSE
    changed :=
      (NEW.brand_primary    IS NOT NULL AND NEW.brand_primary    IS DISTINCT FROM OLD.brand_primary) OR
      (NEW.brand_background IS NOT NULL AND NEW.brand_background IS DISTINCT FROM OLD.brand_background) OR
      (NEW.brand_font       IS NOT NULL AND NEW.brand_font       IS DISTINCT FROM OLD.brand_font);
  END IF;

  IF changed THEN
    RAISE EXCEPTION 'La marca personalizada requiere el plan Pro o Studio'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER businesses_enforce_branding_plan
  BEFORE INSERT OR UPDATE OF brand_primary, brand_background, brand_font ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.enforce_branding_plan();
