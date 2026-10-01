import type { SupabaseClient } from "@supabase/supabase-js";
import { computeExcess, getPlan, type PlanExcess, type PlanId } from "@/lib/plans";

export type PlanChangeExcess = {
  locations: PlanExcess | null;
  professionals: PlanExcess | null;
};

/**
 * Recursos activos que sobran si el negocio pasa a `target`.
 * Las citas del mes no se reconcilian: el límite solo frena citas nuevas.
 */
export async function getPlanExcess(sb: SupabaseClient, businessId: string, target: PlanId): Promise<PlanChangeExcess> {
  const limits = getPlan(target).limits;
  const [locs, pros] = await Promise.all([
    sb.from("locations").select("id,created_at").eq("business_id", businessId).is("deleted_at", null).eq("is_active", true),
    sb.from("professionals").select("id,created_at").eq("business_id", businessId).is("deleted_at", null).eq("is_active", true),
  ]);
  if (locs.error) throw new Error(locs.error.message);
  if (pros.error) throw new Error(pros.error.message);
  return {
    locations: computeExcess(locs.data ?? [], limits.locations),
    professionals: computeExcess(pros.data ?? [], limits.professionals),
  };
}

export function hasExcess(e: PlanChangeExcess): boolean {
  return !!(e.locations || e.professionals);
}

/**
 * Cambia el plan de un negocio (service_role). Si el nuevo plan tiene límites menores,
 * desactiva los recursos más recientes que sobran (no los borra) y deja rastro en audit_log.
 */
export async function applyPlanChange(
  sb: SupabaseClient,
  opts: { businessId: string; plan: PlanId; actorId: string; deactivateExcess: boolean },
) {
  const { data: biz, error: bizErr } = await sb.from("businesses").select("plan").eq("id", opts.businessId).maybeSingle();
  if (bizErr) throw new Error(bizErr.message);
  if (!biz) throw new Error("Negocio no encontrado");

  const excess = await getPlanExcess(sb, opts.businessId, opts.plan);

  const deactivated = { locations: [] as string[], professionals: [] as string[] };
  if (opts.deactivateExcess) {
    if (excess.locations) {
      const { error } = await sb.from("locations").update({ is_active: false }).in("id", excess.locations.deactivateIds);
      if (error) throw new Error(error.message);
      deactivated.locations = excess.locations.deactivateIds;
    }
    if (excess.professionals) {
      const { error } = await sb.from("professionals").update({ is_active: false }).in("id", excess.professionals.deactivateIds);
      if (error) throw new Error(error.message);
      deactivated.professionals = excess.professionals.deactivateIds;
    }
  }

  const { error: updErr } = await sb.from("businesses").update({ plan: opts.plan }).eq("id", opts.businessId);
  if (updErr) throw new Error(updErr.message);

  // El rastro de auditoría no debe impedir el cambio de plan ya hecho.
  await sb.from("audit_log").insert({
    business_id: opts.businessId,
    user_id: opts.actorId,
    action: "plan.changed",
    entity_type: "business",
    entity_id: opts.businessId,
    metadata: { from: biz.plan, to: opts.plan, deactivated },
  });

  return { excess, deactivated };
}
