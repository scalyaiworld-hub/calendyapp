-- 1) Storage policies for private bucket "business-images"
--    Files are stored under `{auth.uid()}/{uuid}.{ext}`.
DROP POLICY IF EXISTS "business-images: owners select own" ON storage.objects;
DROP POLICY IF EXISTS "business-images: owners insert own" ON storage.objects;
DROP POLICY IF EXISTS "business-images: owners update own" ON storage.objects;
DROP POLICY IF EXISTS "business-images: owners delete own" ON storage.objects;

CREATE POLICY "business-images: owners select own"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'business-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "business-images: owners insert own"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'business-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "business-images: owners update own"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'business-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'business-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "business-images: owners delete own"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'business-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 2) Trim anon column access on public.businesses (drop owner_id, plan)
REVOKE SELECT ON public.businesses FROM anon;
GRANT SELECT (
  id, name, slug, timezone, logo_url, created_at, updated_at,
  deleted_at, onboarding_completed, onboarding_step, industry,
  brand_primary, brand_background, brand_font
) ON public.businesses TO anon;