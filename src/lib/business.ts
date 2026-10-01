import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import type { Database } from "@/integrations/supabase/types";
import type { Role } from "@/lib/permissions";

export type MyBusiness = Database["public"]["Tables"]["businesses"]["Row"] & {
  /** Rol de la persona que inició sesión en este negocio. */
  my_role: Role;
  /** Solo para el rol "professional": su profesional asociado. */
  my_professional_id: string | null;
};

// Las invitaciones se intentan aceptar una sola vez por usuario y sesión de navegador.
const triedInvites = new Set<string>();

async function findMembership(userId: string) {
  const { data, error } = await supabase
    .from("business_members")
    .select("business_id,role,professional_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export function useMyBusiness() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-business", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<MyBusiness | null> => {
      const uid = user!.id;

      // 1) Negocio propio.
      const { data: owned, error } = await supabase
        .from("businesses")
        .select("*")
        .eq("owner_id", uid)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (owned) return { ...owned, my_role: "owner", my_professional_id: null };

      // 2) Negocio donde es miembro del equipo (si no tiene, intenta aceptar invitaciones pendientes).
      let membership = await findMembership(uid);
      if (!membership && !triedInvites.has(uid)) {
        triedInvites.add(uid);
        try {
          const { acceptPendingInvites } = await import("@/lib/api/team.functions");
          const { accepted } = await acceptPendingInvites();
          if (accepted > 0) membership = await findMembership(uid);
        } catch {
          // Sin invitaciones o sin red: sigue el flujo normal (crear su propio negocio).
        }
      }
      if (!membership) return null;

      const { data: biz, error: bizErr } = await supabase
        .from("businesses")
        .select("*")
        .eq("id", membership.business_id)
        .is("deleted_at", null)
        .maybeSingle();
      if (bizErr) throw bizErr;
      if (!biz) return null; // p. ej. el negocio bajó de plan Studio: la membresía deja de aplicar
      return { ...biz, my_role: membership.role, my_professional_id: membership.professional_id };
    },
  });
}
