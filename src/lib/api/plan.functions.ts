import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({ businessId: z.string().uuid() });

/**
 * Baja el negocio al plan Free. Es la única transición de plan que el dueño
 * puede hacer solo: los planes de pago los activa el equipo (service_role) tras
 * la solicitud de preregistro. El plan ya no se puede escribir desde el navegador.
 *
 * No se degrada a la fuerza: si el negocio tiene más sucursales o profesionales
 * activos de los que permite Free, se rechaza y debe reducirlos antes.
 */
export const downgradeToFreePlan = createServerFn({ method: "POST" })
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
    if (!biz) throw new Error("No tienes permiso para cambiar este negocio");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { applyPlanChange } = await import("@/lib/plan-change.server");
    await applyPlanChange(supabaseAdmin, {
      businessId: data.businessId,
      plan: "free",
      actorId: userId,
    });

    return { plan: "free" as const };
  });
