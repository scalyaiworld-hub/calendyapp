import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Building2, ChevronRight, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useMyBusiness } from "@/lib/business";
import { useIsAdmin } from "@/lib/admin";
import { rememberAdminChoice } from "@/lib/admin-choice";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/inicio")({
  head: () => ({
    meta: [{ title: "Inicio — Calendya" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: InicioPage,
});

function InicioPage() {
  const { user, loading, signOut } = useAuth();
  const { data: business, isLoading: bizLoading } = useMyBusiness();
  const { isAdmin, isLoading: adminLoading } = useIsAdmin();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) navigate({ to: "/auth", replace: true });
    else if (!adminLoading && !isAdmin) navigate({ to: "/dashboard", replace: true });
  }, [loading, user, adminLoading, isAdmin, navigate]);

  if (loading || !user || adminLoading || bizLoading || !isAdmin) {
    return (
      <div className="min-h-screen grid place-items-center text-muted-foreground">Cargando…</div>
    );
  }

  const hasBusiness = !!business?.onboarding_completed;

  const go = (to: "/admin" | "/dashboard" | "/onboarding") => {
    rememberAdminChoice();
    navigate({ to });
  };

  return (
    <div className="min-h-screen grid place-items-center px-6 py-10">
      <div className="w-full max-w-xl space-y-6">
        <div className="text-center space-y-1">
          <h1 className="font-display text-3xl">Bienvenido</h1>
          <p className="text-sm text-muted-foreground">{user.email} · Administrador de Calendya</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => go("/admin")}
            className="group text-left rounded-xl border border-border bg-card p-5 shadow-soft hover:border-foreground/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ShieldCheck className="size-6 mb-3" aria-hidden />
            <p className="font-medium">Panel de administración</p>
            <p className="text-sm text-muted-foreground mt-1">
              Ver y gestionar todos los negocios, planes y solicitudes.
            </p>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium">
              Entrar{" "}
              <ChevronRight
                className="size-4 transition-transform group-hover:translate-x-0.5"
                aria-hidden
              />
            </span>
          </button>

          <button
            type="button"
            onClick={() => go(hasBusiness ? "/dashboard" : "/onboarding")}
            className="group text-left rounded-xl border border-border bg-card p-5 shadow-soft hover:border-foreground/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Building2 className="size-6 mb-3" aria-hidden />
            <p className="font-medium">{hasBusiness ? "Mi negocio" : "Crear mi negocio"}</p>
            <p className="text-sm text-muted-foreground mt-1">
              {hasBusiness
                ? `Ir al dashboard de ${business?.name}.`
                : "También puedes tener tu propio negocio en Calendya."}
            </p>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium">
              {hasBusiness ? "Entrar" : "Empezar"}{" "}
              <ChevronRight
                className="size-4 transition-transform group-hover:translate-x-0.5"
                aria-hidden
              />
            </span>
          </button>
        </div>

        <div className="text-center">
          <Button variant="ghost" size="sm" onClick={() => signOut()}>
            Cerrar sesión
          </Button>
        </div>
      </div>
    </div>
  );
}
