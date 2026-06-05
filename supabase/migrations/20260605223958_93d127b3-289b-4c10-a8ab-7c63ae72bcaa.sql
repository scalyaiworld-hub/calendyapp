ALTER TABLE public.businesses ADD COLUMN plan text NOT NULL DEFAULT 'free';

UPDATE public.businesses SET plan = 'free' WHERE plan IS NULL;