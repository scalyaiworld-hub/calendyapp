import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { useMyBusiness } from "@/lib/business";
import { CalendarDays, Scissors, Users, Clock, Settings, LayoutDashboard, ExternalLink, Building2, User2, ClipboardList } from "lucide-react";
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
  { to: "/dashboard/citas", label: "Citas", icon: ClipboardList },
  { to: "/dashboard/sucursales", label: "Sucursales", icon: Building2 },
  { to: "/dashboard/profesionales", label: "Profesionales", icon: User2 },
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
      <aside className="fixed inset-y-0 left-0 w-64 border-r border-border bg-card/60 backdrop-blur hidden md:flex flex-col">
        <div className="px-5 py-5 border-b border-border">
          <Link to="/" className="flex items-center gap-2">
            <div className="size-8 rounded-lg bg-foreground grid place-items-center shadow-soft">
              <span className="font-display font-semibold text-background text-base">A</span>
            </div>
            <span className="font-display text-lg font-semibold tracking-tight">Agendy</span>
          </Link>
          {business && (
            <p className="text-xs text-muted-foreground mt-3 truncate font-medium">{business.name}</p>
          )}
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {NAV.map(({ to, label, icon: Icon, exact }) => (
            <Link
              key={to}
              to={to as any}
              activeOptions={{ exact: !!exact }}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              activeProps={{ className: "flex items-center gap-3 rounded-lg px-3 py-2 text-sm bg-foreground text-background font-medium shadow-soft" }}
            >
              <Icon className="size-4" strokeWidth={1.75} />
              {label}
            </Link>
          ))}
          <div className="h-px bg-border my-3 mx-2" />
          {business && (
            <a
              href={`/b/${business.slug}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <ExternalLink className="size-4" strokeWidth={1.75} />
              Página pública
            </a>
          )}
        </nav>
        <div className="p-3 border-t border-border space-y-2">
          <div className="flex items-center justify-between gap-2 rounded-lg bg-background/60 px-3 py-2.5 border border-border">
            <p className="text-xs text-foreground truncate font-medium">{user.email}</p>
            {(() => {
              const plan = ((business as any)?.plan ?? "free") as string;
              const styles =
                plan === "studio"
                  ? "bg-foreground text-background"
                  : plan === "pro"
                  ? "bg-primary/15 text-primary"
                  : "bg-muted text-muted-foreground";
              const label = plan === "studio" ? "Studio" : plan === "pro" ? "Pro" : "Free";
              return (
                <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider shrink-0", styles)}>
                  {label}
                </span>
              );
            })()}
          </div>
          <button onClick={signOut} className="text-xs text-muted-foreground hover:text-foreground px-3 py-1">
            Cerrar sesión
          </button>
        </div>
      </aside>

      <header className="md:hidden border-b border-border bg-card/80 backdrop-blur sticky top-0 z-40 px-4 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <div className="size-7 rounded-md bg-foreground grid place-items-center">
            <span className="font-display font-semibold text-background text-sm">A</span>
          </div>
          <span className="font-display text-base font-semibold tracking-tight">Agendy</span>
        </Link>
        <button onClick={signOut} className="text-xs text-muted-foreground hover:text-foreground">Salir</button>
      </header>
      <nav className={cn("md:hidden flex overflow-x-auto gap-1 px-2 py-2 border-b border-border bg-card/80 backdrop-blur sticky top-14 z-30")}>
        {NAV.map(({ to, label, icon: Icon, exact }) => (
          <Link
            key={to}
            to={to as any}
            activeOptions={{ exact: !!exact }}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-muted-foreground whitespace-nowrap"
            activeProps={{ className: "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs bg-foreground text-background whitespace-nowrap font-medium" }}
          >
            <Icon className="size-3.5" />
            {label}
          </Link>
        ))}
      </nav>

      <main className="md:ml-64 px-4 md:px-10 py-6 md:py-10 max-w-6xl">
        <Outlet />
      </main>
    </div>
    </BrandTheme>
  );
}