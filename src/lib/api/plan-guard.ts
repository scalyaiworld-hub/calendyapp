import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  getPlan,
  hasModule,
  minPlanForModule,
  MODULE_LABELS,
  type ModuleKey,
  type PlanDef,
} from "@/lib/plans";

export class PlanModuleError extends Error {
  constructor(
    public module: ModuleKey,
    public requiredPlan: PlanDef,
  ) {
    super(`El módulo "${MODULE_LABELS[module]}" requiere el plan ${requiredPlan.label}.`);
    this.name = "PlanModuleError";
  }
}

/**
 * Úsalo al inicio de cualquier server function que pertenezca a un módulo de pago.
 * Lee el plan con el cliente del usuario, así que RLS ya garantiza que solo
 * miembros del negocio puedan resolverlo; si no lo ve, se trata como Free.
 */
export async function assertModule(
  supabase: SupabaseClient<Database>,
  businessId: string,
  module: ModuleKey,
): Promise<PlanDef> {
  const { data, error } = await supabase
    .from("businesses")
    .select("plan")
    .eq("id", businessId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!hasModule(data?.plan, module)) throw new PlanModuleError(module, minPlanForModule(module));
  return getPlan(data?.plan);
}
