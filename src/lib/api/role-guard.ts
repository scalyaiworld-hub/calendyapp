import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export class RoleError extends Error {
  constructor(message = "Tu rol no tiene acceso a esta acción.") {
    super(message);
    this.name = "RoleError";
  }
}

/**
 * Exige que el usuario sea dueño del negocio o administrador (rol "manager") de su equipo.
 * La interfaz ya oculta estas pantallas a otros roles, pero la UI no es una barrera: esto las
 * cierra también en el servidor. Se lee con el cliente del usuario, así que RLS limita lo visible.
 */
export async function assertOwnerOrManager(
  supabase: SupabaseClient<Database>,
  userId: string,
  businessId: string,
): Promise<void> {
  const owned = await supabase
    .from("businesses")
    .select("id")
    .eq("id", businessId)
    .eq("owner_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (owned.error) throw new Error(owned.error.message);
  if (owned.data) return;

  const { data, error } = await supabase.rpc("has_business_role", {
    _business_id: businessId,
    _roles: ["manager"],
  });
  if (error) throw new Error(error.message);
  if (!data) throw new RoleError();
}
