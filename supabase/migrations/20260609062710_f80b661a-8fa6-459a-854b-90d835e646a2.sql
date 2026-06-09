
-- 1) Quitar política de INSERT anónima sobre clients (booking público usa supabaseAdmin)
DROP POLICY IF EXISTS "Public can create clients for booking" ON public.clients;

-- 2) Permitir lectura pública de imágenes del bucket business-images
DROP POLICY IF EXISTS "biz_images_public_read" ON storage.objects;
CREATE POLICY "biz_images_public_read" ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'business-images');
