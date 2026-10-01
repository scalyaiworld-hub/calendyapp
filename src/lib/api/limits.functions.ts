import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getPlan, type PlanId } from "@/lib/plans";
import { monthBoundsInTz } from "@/lib/tz";

const schema = z.object({
  businessId: z.string().uuid(),
  kind: z.enum(["appointment", "location", "professional"]),
});

export type LimitCheck = {
  allowed: boolean;
  used: number;
  limit: number | null;
  plan: PlanId;
  planLabel: string;
};

/**
 * Devuelve el uso actual y el límite del recurso para que la UI pueda
 * mostrar el botón "Crear" o un CTA a /planes — sin pegarse al servidor
 * en cada render: úsalo dentro de useQuery con staleTime alto.
 */
export const checkResourceLimit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => schema.parse(input))
  .handler(async ({ data, context }): Promise<LimitCheck> => {
    const { supabase } = context;

    const { data: biz, error: bizErr } = await supabase
      .from("businesses")
      .select("plan,timezone")
      .eq("id", data.businessId)
      .maybeSingle();
    if (bizErr) throw new Error(bizErr.message);
    const planDef = getPlan(biz?.plan);

    let used = 0;
    let limit: number | null = null;

    if (data.kind === "appointment") {
      limit = planDef.limits.appointmentsPerMonth;
      // Mismo criterio que el trigger de la base: mes calendario en la zona del negocio.
      const { start, end } = monthBoundsInTz(new Date(), biz?.timezone ?? "America/Lima");
      const { count } = await supabase
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("business_id", data.businessId)
        // Solo las citas confirmadas consumen cupo; las pendientes se validan al confirmar.
        .in("status", ["booked", "completed", "no_show"])
        .gte("starts_at", start.toISOString())
        .lt("starts_at", end.toISOString());
      used = count ?? 0;
    } else if (data.kind === "location") {
      limit = planDef.limits.locations;
      const { count } = await supabase
        .from("locations")
        .select("id", { count: "exact", head: true })
        .eq("business_id", data.businessId)
        .is("deleted_at", null)
        .eq("is_active", true);
      used = count ?? 0;
    } else {
      limit = planDef.limits.professionals;
      const { count } = await supabase
        .from("professionals")
        .select("id", { count: "exact", head: true })
        .eq("business_id", data.businessId)
        .is("deleted_at", null)
        .eq("is_active", true);
      used = count ?? 0;
    }

    return {
      allowed: limit === null ? true : used < limit,
      used,
      limit,
      plan: planDef.id,
      planLabel: planDef.label,
    };
  });