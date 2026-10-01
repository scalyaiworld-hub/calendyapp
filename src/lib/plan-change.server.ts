import type { SupabaseClient } from "@supabase/supabase-js";
import { describeTransitionBlock, getPlan, planTransitionBlock, type PlanId } from "@/lib/plans";

/**
 * Cambia el plan de un negocio (service_role). Un negocio nunca se degrada a la fuerza:
 * si tiene más sucursales o profesionales activos de los que permite el plan destino,
 * el cambio se rechaza y el dueño debe reducirlos primero. Deja rastro en audit_log.
 */
export async function applyPlanChange(sb: SupabaseClient, opts: { businessId: string; plan: PlanId; actorId: string }) {
  const { data: biz, error: bizErr } = await sb.from("businesses").select("plan").eq("id", opts.businessId).maybeSingle();
  if (bizErr) throw new Error(bizErr.message);
  if (!biz) throw new Error("Negocio no encontrado");

  const [locs, pros] = await Promise.all([
    sb.from("locations").select("id", { count: "exact", head: true }).eq("business_id", opts.businessId).is("deleted_at", null).eq("is_active", true),
    sb.from("professionals").select("id", { count: "exact", head: true }).eq("business_id", opts.businessId).is("deleted_at", null).eq("is_active", true),
  ]);
  if (locs.error) throw new Error(locs.error.message);
  if (pros.error) throw new Error(pros.error.message);

  const block = planTransitionBlock({ locations: locs.count ?? 0, professionals: pros.count ?? 0 }, opts.plan);
  if (block) throw new Error(describeTransitionBlock(block, getPlan(opts.plan).label));

  const { error: updErr } = await sb.from("businesses").update({ plan: opts.plan }).eq("id", opts.businessId);
  if (updErr) throw new Error(updErr.message);

  // El rastro de auditoría no debe impedir el cambio de plan ya hecho.
  await sb.from("audit_log").insert({
    business_id: opts.businessId,
    user_id: opts.actorId,
    action: "plan.changed",
    entity_type: "business",
    entity_id: opts.businessId,
    metadata: { from: biz.plan, to: opts.plan },
  });
}
