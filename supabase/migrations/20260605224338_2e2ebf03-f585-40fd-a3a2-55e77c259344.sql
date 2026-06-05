UPDATE public.businesses b
SET deleted_at = now()
WHERE b.deleted_at IS NULL
  AND b.onboarding_completed = false
  AND b.name = b.slug
  AND b.name ~ '^salon-[a-z0-9]{4,8}$'
  AND EXISTS (
    SELECT 1 FROM public.businesses b2
    WHERE b2.owner_id = b.owner_id
      AND b2.id <> b.id
      AND b2.deleted_at IS NULL
  );