import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { getAdminStatus } from "@/lib/api/admin.functions";

/** ¿El usuario es administrador de la plataforma? Un error al verificarlo se trata como "no". */
export function useIsAdmin() {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ["admin-status", user?.id],
    enabled: !!user,
    queryFn: () => getAdminStatus(),
    staleTime: 60_000,
    retry: false,
  });
  return { isAdmin: q.data?.isAdmin === true, isLoading: !!user && q.isPending };
}
