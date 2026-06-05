import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { useMyBusiness } from "@/lib/business";
import { CalendarDays, Scissors, Users, Clock, Settings, LayoutDashboard, ExternalLink, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandTheme } from "@/lib/brand-theme";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Agendy" }] }),
  component: DashboardLayout,
});

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; exact?: boolean };
const NAV: NavItem[] = [
  { to: "/dashboard", label: "Resumen", icon: LayoutDashboard, exact: true },
  { to: "/dashboard/agenda", label: "Agenda", icon: CalendarDays },
  { to: "/dashboard/sucursales", label: "Sucursales", icon: Building2 },
  { to: "/dashboard/servicios", label: "Servicios", icon: Scissors },
  { to: "/dashboard/clientes", label: "Clientes", icon: Users },
  { to: "/dashboard/horarios", label: "Horarios", icon: Clock },
  { to: "/dashboard/ajustes", label: "Ajustes", icon: Settings },
];

function DashboardLayout() {
  const { user, loading, signOut } = useAuth();
  const { data: business, isLoading: bizLoading } = useMyBusiness();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", replace: true });
  }, [user, loading, navigate]);

  // Force onboarding before any dashboard route renders
  useEffect(() => {
    if (loading || bizLoading || !user) return;
    if (!business || !business.onboarding_completed) {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [loading, bizLoading, user, business, navigate]);

  if (loading || !user || bizLoading) {
    return <div className="min-h-screen grid place-items-center text-muted-foreground">Cargando…</div>;
  }
  if (!business || !business.onboarding_completed) {
    return <div className="min-h-screen grid place-items-center text-muted-foreground">Cargando…</div>;
  }

  return (
    <BrandTheme brand={business as any}>
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 w-60 border-r border-border bg-card hidden md:flex flex-col">
        <div className="px-6 py-6 border-b border-border">
          <Link to="/" className="font-display text-2xl gradient-rose-text">Agendy</Link>
          {business && (
            <p className="text-xs text-muted-foreground mt-1 truncate">{business.name}</p>
          )}
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.map(({ to, label, icon: Icon, exact }) => (
            <Link
              key={to}
              to={to as any}
              activeOptions={{ exact: !!exact }}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              activeProps={{ className: "flex items-center gap-3 rounded-md px-3 py-2 text-sm bg-primary/10 text-primary font-medium" }}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
          {business && (
            <a
              href={`/b/${business.slug}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <ExternalLink className="size-4" />
              Página pública
            </a>
          )}
        </nav>
        <div className="p-4 border-t border-border">
          <p className="text-xs text-muted-foreground truncate mb-2">{user.email}</p>
          <button onClick={signOut} className="text-xs text-muted-foreground hover:text-foreground">
            Cerrar sesión
          </button>
        </div>
      </aside>

      <header className="md:hidden border-b border-border bg-card px-4 py-3 flex items-center justify-between">
        <Link to="/" className="font-display text-xl gradient-rose-text">Agendy</Link>
        <button onClick={signOut} className="text-xs text-muted-foreground">Salir</button>
      </header>
      <nav className={cn("md:hidden flex overflow-x-auto gap-1 px-2 py-2 border-b border-border bg-card")}>
        {NAV.map(({ to, label, icon: Icon, exact }) => (
          <Link
            key={to}
            to={to as any}
            activeOptions={{ exact: !!exact }}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-muted-foreground whitespace-nowrap"
            activeProps={{ className: "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs bg-primary/10 text-primary whitespace-nowrap font-medium" }}
          >
            <Icon className="size-3.5" />
            {label}
          </Link>
        ))}
      </nav>

      <main className="md:ml-60 px-4 md:px-8 py-6 md:py-10 max-w-6xl">
        <Outlet />
      </main>
    </div>
    </BrandTheme>
  );
}