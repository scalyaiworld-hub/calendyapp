import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type EntityCounts = { pros: number; services: number; locations: number };

export function entityCountsQueryKey(businessId: string | undefined) {
  return ["entity-counts", businessId] as const;
}

async function fetchEntityCounts(businessId: string): Promise<EntityCounts> {
  const [pros, services, locs] = await Promise.all([
    supabase
      .from("professionals")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .is("deleted_at", null)
      .eq("is_active", true),
    supabase
      .from("services")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .is("deleted_at", null)
      .eq("is_active", true),
    supabase
      .from("locations")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .is("deleted_at", null)
      .eq("is_active", true),
  ]);
  if (pros.error) throw pros.error;
  if (services.error) throw services.error;
  if (locs.error) throw locs.error;
  return {
    pros: pros.count ?? 0,
    services: services.count ?? 0,
    locations: locs.count ?? 0,
  };
}

/**
 * Hook compartido para los contadores de profesionales, servicios y sucursales.
 * Una sola query cacheada que reusan Agenda, Ajustes y el layout del Dashboard.
 */
export function useEntityCounts(businessId: string | undefined) {
  return useQuery({
    queryKey: entityCountsQueryKey(businessId),
    enabled: !!businessId,
    queryFn: () => fetchEntityCounts(businessId!),
  });
}
