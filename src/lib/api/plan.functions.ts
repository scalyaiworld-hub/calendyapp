import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({
  businessId: z.string().uuid(),
  // Segunda llamada: el dueño ya vio qué se desactivará y lo confirmó.
  confirm: z.boolean().optional(),
});

export type DowngradeResult =
  | { ok: true; plan: "free"; deactivated: { locations: number; professionals: number } }
  | {
      ok: false;
      needsConfirmation: true;
      excess: {
        locations: { limit: number; active: number; deactivate: number } | null;
        professionals: { limit: number; active: number; deactivate: number } | null;
      };
    };

/**
 * Baja el negocio al plan Free. Es la única transición de plan que el dueño
 * puede hacer solo: los planes de pago los activa el equipo (service_role) tras
 * la solicitud de preregistro. El plan ya no se puede escribir desde el navegador.
 *
 * Si el negocio supera los límites de Free (sucursales / profesionales activos),
 * la primera llamada no cambia nada y devuelve qué se desactivaría; con
 * `confirm: true` se desactivan los más recientes y se aplica el cambio.
 */
export const downgradeToFreePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => schema.parse(input))
  .handler(async ({ data, context }): Promise<DowngradeResult> => {
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
    const { applyPlanChange, getPlanExcess, hasExcess } = await import("@/lib/plan-change.server");

    if (!data.confirm) {
      const excess = await getPlanExcess(supabaseAdmin, data.businessId, "free");
      if (hasExcess(excess)) {
        const summarize = (e: typeof excess.locations) =>
          e ? { limit: e.limit, active: e.active, deactivate: e.deactivateIds.length } : null;
        return {
          ok: false,
          needsConfirmation: true,
          excess: { locations: summarize(excess.locations), professionals: summarize(excess.professionals) },
        };
      }
    }

    const { deactivated } = await applyPlanChange(supabaseAdmin, {
      businessId: data.businessId,
      plan: "free",
      actorId: userId,
      deactivateExcess: true,
    });
    return {
      ok: true,
      plan: "free",
      deactivated: { locations: deactivated.locations.length, professionals: deactivated.professionals.length },
    };
  });
