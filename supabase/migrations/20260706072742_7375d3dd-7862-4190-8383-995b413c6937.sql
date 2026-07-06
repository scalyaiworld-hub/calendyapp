-- businesses: quitar phone / whatsapp_* para anon
REVOKE SELECT ON public.businesses FROM anon;
GRANT SELECT (
  id, name, slug, owner_id, timezone, logo_url, created_at, updated_at,
  deleted_at, onboarding_completed, onboarding_step, industry,
  brand_primary, brand_background, brand_font, plan
) ON public.businesses TO anon;

-- locations: quitar phone / phone_country_code para anon
REVOKE SELECT ON public.locations FROM anon;
GRANT SELECT (
  id, business_id, name, address, is_active, deleted_at,
  created_at, updated_at, image_url
) ON public.locations TO anon;

-- professionals: quitar phone / phone_country_code para anon
REVOKE SELECT ON public.professionals FROM anon;
GRANT SELECT (
  id, business_id, name, avatar_url, is_active, deleted_at,
  created_at, updated_at
) ON public.professionals TO anon;