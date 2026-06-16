import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getPlan, type PlanId } from "@/lib/plans";

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
      .select("plan")
      .eq("id", data.businessId)
      .maybeSingle();
    if (bizErr) throw new Error(bizErr.message);
    const planDef = getPlan(biz?.plan);

    let used = 0;
    let limit: number | null = null;

    if (data.kind === "appointment") {
      limit = planDef.limits.appointmentsPerMonth;
      const start = new Date();
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setMonth(end.getMonth() + 1);
      const { count } = await supabase
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("business_id", data.businessId)
        .neq("status", "cancelled")
        .gte("starts_at", start.toISOString())
        .lt("starts_at", end.toISOString());
      used = count ?? 0;
    } else if (data.kind === "location") {
      limit = planDef.limits.locations;
      const { count } = await supabase
        .from("locations")
        .select("id", { count: "exact", head: true })
        .eq("business_id", data.businessId)
        .is("deleted_at", null);
      used = count ?? 0;
    } else {
      limit = planDef.limits.professionals;
      const { count } = await supabase
        .from("professionals")
        .select("id", { count: "exact", head: true })
        .eq("business_id", data.businessId)
        .is("deleted_at", null);
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