ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS brand_primary text,
  ADD COLUMN IF NOT EXISTS brand_background text,
  ADD COLUMN IF NOT EXISTS brand_font text;
GRANT SELECT (brand_primary, brand_background, brand_font) ON public.businesses TO anon;
GRANT SELECT (brand_primary, brand_background, brand_font) ON public.businesses TO authenticated;