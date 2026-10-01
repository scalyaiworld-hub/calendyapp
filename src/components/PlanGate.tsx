import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { useMyBusiness } from "@/lib/business";
import { hasModule, minPlanForModule, MODULE_LABELS, type ModuleKey } from "@/lib/plans";
import { Button } from "@/components/ui/button";

/** Hook para decisiones puntuales (ocultar un botón, mostrar un badge). */
export function useModuleAccess(module: ModuleKey) {
  const { data: business, isLoading } = useMyBusiness();
  return { allowed: hasModule((business as any)?.plan, module), isLoading };
}

/**
 * Renderiza `children` si el plan del negocio incluye el módulo; si no, un CTA a /dashboard/planes.
 * Es solo UX: la protección real va en el servidor con `assertModule`.
 */
export function PlanGate({ module, children, fallback }: { module: ModuleKey; children: ReactNode; fallback?: ReactNode }) {
  const { allowed, isLoading } = useModuleAccess(module);
  if (isLoading) return null;
  if (allowed) return <>{children}</>;
  if (fallback !== undefined) return <>{fallback}</>;

  const required = minPlanForModule(module);
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/60 p-8 text-center max-w-lg mx-auto">
      <div className="mx-auto mb-4 size-10 rounded-full bg-muted grid place-items-center text-muted-foreground">
        <Lock className="size-5" strokeWidth={1.75} />
      </div>
      <h2 className="font-display text-xl font-semibold tracking-tight mb-1">{MODULE_LABELS[module]}</h2>
      <p className="text-sm text-muted-foreground mb-5">Disponible desde el plan {required.label}.</p>
      <Button asChild>
        <Link to="/dashboard/planes">Ver planes</Link>
      </Button>
    </div>
  );
}
