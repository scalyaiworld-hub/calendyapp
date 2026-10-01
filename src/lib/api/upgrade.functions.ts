import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({
  businessId: z.string().uuid(),
  plan: z.enum(["pro", "studio"]),
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().max(40).optional(),
  industry: z.string().trim().min(1).max(80),
  message: z.string().trim().max(800).optional(),
  details: z.record(z.string().max(200)).optional(),
});

/**
 * Guarda la solicitud de upgrade de un negocio. Solo el dueño puede enviarla y
 * la tabla solo es accesible con service_role. Una solicitud abierta por
 * negocio y plan: si ya existe una en las últimas 24 h no se duplica.
 */
export const submitUpgradeRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => schema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Con la sesión del usuario: solo devuelve la fila si es el dueño (RLS).
    const { data: biz, error } = await supabase
      .from("businesses")
      .select("id")
      .eq("id", data.businessId)
      .eq("owner_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!biz) throw new Error("No tienes permiso para solicitar un plan para este negocio");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recent, error: recentErr } = await supabaseAdmin
      .from("upgrade_requests")
      .select("id")
      .eq("business_id", data.businessId)
      .eq("plan", data.plan)
      .gte("created_at", since)
      .limit(1);
    if (recentErr) throw new Error(recentErr.message);
    if (recent && recent.length > 0) return { ok: true as const, duplicate: true as const };

    const { error: insErr } = await supabaseAdmin.from("upgrade_requests").insert({
      business_id: data.businessId,
      user_id: userId,
      plan: data.plan,
      name: data.name,
      email: data.email,
      phone: data.phone || null,
      industry: data.industry,
      message: data.message || null,
      details: data.details ?? {},
    });
    if (insErr) throw new Error(insErr.message);

    return { ok: true as const, duplicate: false as const };
  });
