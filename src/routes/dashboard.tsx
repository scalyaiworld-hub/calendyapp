import { Logo } from "@/components/Logo";
import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useMyBusiness } from "@/lib/business";
import {
  CalendarDays,
  Scissors,
  Users,
  Clock,
  Settings,
  LayoutDashboard,
  ExternalLink,
  Building2,
  User2,
  ClipboardList,
  Menu,
  X,
  LogOut,
  Lock,
  Sparkles,
  ShieldCheck,
  UsersRound,
  BarChart3,
} from "lucide-react";
import { useEntityCounts } from "@/lib/entity-counts";
import { canAccessPath, ROLE_LABELS, type Role } from "@/lib/permissions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { BrandTheme } from "@/lib/brand-theme";
import { hasModule } from "@/lib/plans";
import { useIsAdmin } from "@/lib/admin";
import { hasChosenAdminDestination } from "@/lib/admin-choice";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Calendya" }] }),
  component: DashboardLayout,
});

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; exact?: boolean };
type NavGroup = { label: string; items: NavItem[] };
const NAV_GROUPS: NavGroup[] = [
  {
    label: "Operación",
    items: [
      { to: "/dashboard", label: "Resumen", icon: LayoutDashboard, exact: true },
      { to: "/dashboard/agenda", label: "Agenda", icon: CalendarDays },
      { to: "/dashboard/citas", label: "Citas", icon: ClipboardList },
      { to: "/dashboard/clientes", label: "Clientes", icon: Users },
      { to: "/dashboard/metricas", label: "Métricas", icon: BarChart3 },
    ],
  },
  {
    label: "Catálogo",
    items: [
      { to: "/dashboard/servicios", label: "Servicios", icon: Scissors },
      { to: "/dashboard/profesionales", label: "Profesionales", icon: User2 },
      { to: "/dashboard/sucursales", label: "Sucursales", icon: Building2 },
      { to: "/dashboard/horarios", label: "Horarios", icon: Clock },
    ],
  },
  {
    label: "Cuenta",
    items: [
      { to: "/dashboard/equipo", label: "Equipo", icon: UsersRound },
      { to: "/dashboard/planes", label: "Planes", icon: Sparkles },
      { to: "/dashboard/ajustes", label: "Ajustes", icon: Settings },
    ],
  },
];

function DashboardLayout() {
  const { user, loading, signOut } = useAuth();
  const { data: business, isLoading: bizLoading } = useMyBusiness();
  const { isAdmin, isLoading: adminLoading } = useIsAdmin();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const { data: readyCounts } = useEntityCounts(business?.id);
  const canShareLink =
    (readyCounts?.pros ?? 0) > 0 &&
    (readyCounts?.services ?? 0) > 0 &&
    (readyCounts?.locations ?? 0) > 0;

  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const role = ((business as { my_role?: Role } | null | undefined)?.my_role ?? "owner") as Role;

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", replace: true });
  }, [user, loading, navigate]);

  // Los administradores eligen primero entre el panel admin y su negocio (/inicio).
  const needsAdminChoice = isAdmin && !hasChosenAdminDestination();

  // Un miembro que entra por URL a una pantalla que su rol no tiene vuelve al resumen
  // (la seguridad real la aplica la base con RLS; esto es solo para no mostrar pantallas rotas).
  useEffect(() => {
    if (business && !canAccessPath(role, pathname)) navigate({ to: "/dashboard", replace: true });
  }, [business, role, pathname, navigate]);

  // Force onboarding before any dashboard route renders
  useEffect(() => {
    if (loading || bizLoading || adminLoading || !user) return;
    if (needsAdminChoice) {
      navigate({ to: "/inicio", replace: true });
      return;
    }
    if (!business || !business.onboarding_completed) {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [loading, bizLoading, adminLoading, user, business, needsAdminChoice, navigate]);

  if (loading || !user || bizLoading || adminLoading || needsAdminChoice) {
    return (
      <div className="min-h-screen grid place-items-center text-muted-foreground">Cargando…</div>
    );
  }
  if (!business || !business.onboarding_completed) {
    return (
      <div className="min-h-screen grid place-items-center text-muted-foreground">Cargando…</div>
    );
  }

  const plan = ((business as any)?.plan ?? "free") as string;
  const planStyles =
    plan === "studio"
      ? "bg-foreground text-background"
      : plan === "pro"
        ? "bg-primary/15 text-primary"
        : "bg-muted text-muted-foreground";
  const planLabel = plan === "studio" ? "Studio" : plan === "pro" ? "Pro" : "Free";

  const visibleGroups = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => canAccessPath(role, i.to)),
  })).filter((g) => g.items.length > 0);

  const SidebarInner = ({ onNavigate }: { onNavigate?: () => void }) => (
    <>
      <div className="px-5 py-5 border-b border-border">
        <Link to="/" className="flex items-center" onClick={onNavigate} aria-label="Calendya">
          <Logo size={32} />
        </Link>
        {business && (
          <div className="mt-4 flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground truncate font-medium">{business.name}</p>
            <span
              className={cn(
                "text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider shrink-0",
                planStyles,
              )}
            >
              {role === "owner" ? planLabel : ROLE_LABELS[role]}
            </span>
          </div>
        )}
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {visibleGroups.map((group) => (
          <div key={group.label}>
            <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map(({ to, label, icon: Icon, exact }) => (
                <Link
                  key={to}
                  to={to as any}
                  preload="intent"
                  activeOptions={{ exact: !!exact }}
                  onClick={onNavigate}
                  className="group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                  activeProps={{
                    className:
                      "group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm bg-accent text-foreground font-medium before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-0.5 before:bg-foreground before:rounded-full",
                  }}
                >
                  <Icon className="size-4 shrink-0" strokeWidth={1.75} />
                  {label}
                </Link>
              ))}
            </div>
          </div>
        ))}
        {business && (
          <div>
            <div className="h-px bg-border my-2 mx-2" />
            {canShareLink ? (
              <a
                href={`/b/${business.slug}`}
                target="_blank"
                rel="noreferrer"
                onClick={onNavigate}
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <ExternalLink className="size-4" strokeWidth={1.75} />
                Página pública
              </a>
            ) : (
              <button
                type="button"
                onClick={() =>
                  toast.info(
                    "Agrega al menos un profesional y un servicio para activar tu página pública.",
                  )
                }
                className="w-full flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground/60 cursor-not-allowed text-left"
                title="Agrega al menos un profesional y un servicio"
              >
                <Lock className="size-4" strokeWidth={1.75} />
                Página pública
              </button>
            )}
            {isAdmin && (
              <Link
                to="/admin"
                onClick={onNavigate}
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <ShieldCheck className="size-4" strokeWidth={1.75} />
                Panel de administración
              </Link>
            )}
          </div>
        )}
      </nav>
      <div className="p-3 border-t border-border">
        <div className="flex items-center gap-2 rounded-lg bg-background/60 px-3 py-2 border border-border">
          <div className="size-7 rounded-full bg-foreground grid place-items-center shrink-0">
            <span className="text-background text-xs font-semibold">
              {user.email?.[0]?.toUpperCase() ?? "U"}
            </span>
          </div>
          <p className="text-xs text-foreground truncate font-medium flex-1 min-w-0">
            {user.email}
          </p>
          <button
            onClick={signOut}
            title="Cerrar sesión"
            className="text-muted-foreground hover:text-foreground p-1 rounded"
          >
            <LogOut className="size-3.5" />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <BrandTheme brand={hasModule((business as any)?.plan, "branding") ? (business as any) : null}>
      <div className="min-h-screen bg-background">
        <aside className="fixed inset-y-0 left-0 w-64 border-r border-border bg-card/60 backdrop-blur hidden md:flex flex-col z-30">
          <SidebarInner />
        </aside>

        {/* Mobile header */}
        <header className="md:hidden border-b border-border bg-card/80 backdrop-blur sticky top-0 z-40 px-4 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center" aria-label="Calendya">
            <Logo size={28} />
          </Link>
          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 -mr-2 rounded-md hover:bg-accent text-foreground"
            aria-label="Abrir menú"
          >
            <Menu className="size-5" />
          </button>
        </header>

        {/* Mobile drawer */}
        {mobileOpen && (
          <div className="md:hidden fixed inset-0 z-50">
            <div
              className="absolute inset-0 bg-foreground/30 backdrop-blur-sm"
              onClick={() => setMobileOpen(false)}
            />
            <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-background border-r border-border flex flex-col shadow-soft-lg">
              <button
                onClick={() => setMobileOpen(false)}
                className="absolute top-3 right-3 p-2 rounded-md hover:bg-accent text-muted-foreground"
                aria-label="Cerrar menú"
              >
                <X className="size-5" />
              </button>
              <SidebarInner onNavigate={() => setMobileOpen(false)} />
            </aside>
          </div>
        )}

        <main className="md:ml-64 px-4 md:px-10 py-6 md:py-10 max-w-6xl">
          <Outlet />
        </main>
      </div>
    </BrandTheme>
  );
}
