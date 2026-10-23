import { assertModule } from "@/lib/api/plan-guard";

/** Solo el dueño gestiona integraciones, y solo si su plan incluye el módulo. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- el cliente del middleware no comparte el tipo Database
export async function requireOwner(context: { supabase: any; userId: string }, businessId: string) {
  const { data, error } = await context.supabase
    .from("businesses")
    .select("id")
    .eq("id", businessId)
    .eq("owner_id", context.userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Solo el dueño puede gestionar las integraciones.");
  await assertModule(context.supabase, businessId, "integrations");
}
