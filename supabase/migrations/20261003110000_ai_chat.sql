-- Chat con IA para clientes (módulo "aiChat", plan Studio).
-- NO aplicar sin revisar. Va después de 20261001180000_integrations.sql.

-- El dueño activa el chat y puede añadir instrucciones propias (políticas, tono, etc.).
ALTER TABLE public.businesses
  ADD COLUMN ai_chat_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN ai_chat_instructions text CHECK (ai_chat_instructions IS NULL OR length(ai_chat_instructions) <= 600);

-- security_hardening dejó a `authenticated` con una lista cerrada de columnas actualizables en businesses.
GRANT UPDATE (ai_chat_enabled, ai_chat_instructions) ON public.businesses TO authenticated;

-- Registro de uso para límites y costos. NO guarda el contenido de las conversaciones ni datos
-- personales: solo un hash de la IP (para limitar abuso), tokens y si terminó en una reserva.
CREATE TABLE public.ai_chat_usage (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  ip_hash       text NOT NULL,
  input_tokens  integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  booked        boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_chat_usage_business_idx ON public.ai_chat_usage (business_id, created_at DESC);
CREATE INDEX ai_chat_usage_ip_idx ON public.ai_chat_usage (business_id, ip_hash, created_at DESC);

ALTER TABLE public.ai_chat_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_chat_usage FROM anon, authenticated;
GRANT ALL ON public.ai_chat_usage TO service_role;

-- Limpieza opcional (el uso de más de 90 días no hace falta):
--   SELECT cron.schedule('prune-ai-chat-usage', '0 4 * * *',
--     $$ DELETE FROM public.ai_chat_usage WHERE created_at < now() - interval '90 days' $$);
