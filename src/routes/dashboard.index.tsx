import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMyBusiness } from "@/lib/business";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatTime } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { CalendarDays, Scissors, Users, Plus, Link2, ArrowRight, Clock3, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getPlan, MODULE_LABELS } from "@/lib/plans";
import { Sparkles, Lock, Crown } from "lucide-react";

export const Route = createFileRoute("/dashboard/")({
  component: DashboardHome,
});

function DashboardHome() {
  const { data: business, isLoading } = useMyBusiness();
  if (isLoading) return <p className="text-muted-foreground">Cargando…</p>;
  if (!business) return null;
  return <Summary businessId={business.id} businessName={business.name} slug={business.slug} plan={(business as any).plan ?? "free"} />;
}

function Summary({ businessId, businessName, slug, plan: planId }: { businessId: string; businessName: string; slug: string; plan: string }) {
  const plan = getPlan(planId);
  const { data: today } = useQuery({
    queryKey: ["today-appts", businessId],
    queryFn: async () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      const { data, error } = await supabase
        .from("appointments")
        .select("*, clients(name, phone), services(name, duration_minutes)")
        .eq("business_id", businessId)
        .gte("starts_at", start.toISOString())
        .lt("starts_at", end.toISOString())
        .in("status", ["pending", "booked", "completed"])
        .order("starts_at");
      if (error) throw error;
      return data;
    },
  });

  const { data: counts } = useQuery({
    queryKey: ["counts", businessId],
    queryFn: async () => {
      const [services, clients, pros, locs, pending] = await Promise.all([
        supabase.from("services").select("id", { count: "exact", head: true }).eq("business_id", businessId).is("deleted_at", null),
        supabase.from("clients").select("id", { count: "exact", head: true }).eq("business_id", businessId).is("deleted_at", null),
        supabase.from("professionals").select("id", { count: "exact", head: true }).eq("business_id", businessId).is("deleted_at", null).eq("is_active", true),
        supabase.from("locations").select("id", { count: "exact", head: true }).eq("business_id", businessId).is("deleted_at", null).eq("is_active", true),
        supabase.from("appointments").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("status", "pending"),
      ]);
      return {
        services: services.count ?? 0,
        clients: clients.count ?? 0,
        pros: pros.count ?? 0,
        locs: locs.count ?? 0,
        pending: pending.count ?? 0,
      };
    },
  });

  const { data: monthApptsCount } = useQuery({
    queryKey: ["month-appts-count", businessId],
    queryFn: async () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const { count } = await supabase
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("business_id", businessId)
        .gte("starts_at", start.toISOString())
        .lt("starts_at", end.toISOString())
        .in("status", ["pending", "booked", "completed"]);
      return count ?? 0;
    },
  });

  const now = new Date();
  const upcoming = (today ?? []).find((a: any) => new Date(a.ends_at) >= now);
  const completedToday = (today ?? []).filter((a: any) => a.status === "completed").length;
  const isReady = (counts?.pros ?? 0) > 0 && (counts?.services ?? 0) > 0 && (counts?.locs ?? 0) > 0;
  const bookingUrl = typeof window !== "undefined" ? `${window.location.origin}/b/${slug}` : `/b/${slug}`;
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Buenos días";
    if (h < 19) return "Buenas tardes";
    return "Buenas noches";
  })();

  return (
    <div>
      <PageHeader
        eyebrow={greeting}
        title={businessName}
        description={new Date().toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        actions={
          <>
            <Button asChild variant="outline">
              <Link to="/dashboard/agenda"><Plus className="size-4" /> Nueva cita</Link>
            </Button>
            <Button
              disabled={!isReady}
              onClick={() => { navigator.clipboard.writeText(bookingUrl); toast.success("Link copiado"); }}
              title={isReady ? undefined : "Completa sucursal, profesional y servicio"}
            >
              <Link2 className="size-4" /> Copiar link de reservas
            </Button>
          </>
        }
      />

      <div className="space-y-8">
        {/* Setup checklist when not ready */}
        {!isReady && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="size-5 text-primary mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="font-medium mb-1">Termina de configurar para activar tu link de reservas</p>
                  <p className="text-sm text-muted-foreground mb-4">Necesitas al menos una sucursal, un profesional y un servicio.</p>
                  <div className="flex flex-wrap gap-2">
                    <ChecklistItem done={(counts?.locs ?? 0) > 0} label="Sucursal" to="/dashboard/sucursales" />
                    <ChecklistItem done={(counts?.pros ?? 0) > 0} label="Profesional" to="/dashboard/profesionales" />
                    <ChecklistItem done={(counts?.services ?? 0) > 0} label="Servicio" to="/dashboard/servicios" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat icon={CalendarDays} label="Citas hoy" value={today?.length ?? 0} hint={completedToday > 0 ? `${completedToday} completadas` : undefined} />
          <Stat icon={Clock3} label="Pendientes" value={counts?.pending ?? 0} accent={(counts?.pending ?? 0) > 0} />
          <Stat icon={Scissors} label="Servicios" value={counts?.services ?? 0} />
          <Stat icon={Users} label="Clientes" value={counts?.clients ?? 0} />
        </div>

        {/* Plan card */}
        <PlanCard
          plan={plan}
          usage={{
            appointmentsMonth: monthApptsCount ?? 0,
            locations: counts?.locs ?? 0,
            professionals: counts?.pros ?? 0,
          }}
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Next up */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="font-display text-base text-muted-foreground font-medium">Próxima cita</CardTitle>
            </CardHeader>
            <CardContent>
              {upcoming ? (
                <div className="space-y-3">
                  <p className="font-display text-3xl tracking-tight">{formatTime(upcoming.starts_at)}</p>
                  <div>
                    <p className="font-medium">{upcoming.clients?.name}</p>
                    <p className="text-sm text-muted-foreground">{upcoming.services?.name} · {upcoming.services?.duration_minutes} min</p>
                  </div>
                  <Button asChild variant="outline" size="sm" className="w-full">
                    <Link to="/dashboard/agenda">Ver agenda <ArrowRight className="size-3.5" /></Link>
                  </Button>
                </div>
              ) : (
                <div className="text-center py-6">
                  <Clock3 className="size-8 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground mb-3">Sin citas próximas hoy</p>
                  <Button asChild size="sm" variant="outline">
                    <Link to="/dashboard/agenda"><Plus className="size-3.5" /> Crear cita</Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Today list */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="font-display text-xl">Citas de hoy</CardTitle>
                <CardDescription>{today?.length ?? 0} {today?.length === 1 ? "cita programada" : "citas programadas"}</CardDescription>
              </div>
              <Button asChild variant="ghost" size="sm">
                <Link to="/dashboard/agenda">Abrir agenda <ArrowRight className="size-3.5" /></Link>
              </Button>
            </CardHeader>
            <CardContent>
              {!today?.length ? (
                <div className="text-center py-10 border border-dashed border-border rounded-lg">
                  <CalendarDays className="size-10 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="font-medium mb-1">No hay citas hoy</p>
                  <p className="text-sm text-muted-foreground mb-4">Crea una desde la agenda o comparte tu link público.</p>
                  <Button asChild size="sm">
                    <Link to="/dashboard/agenda"><Plus className="size-3.5" /> Crear cita</Link>
                  </Button>
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {today.map((a: any) => (
                    <li key={a.id} className="py-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="size-10 rounded-md bg-muted grid place-items-center shrink-0">
                          <span className="font-display text-xs text-muted-foreground">{formatTime(a.starts_at)}</span>
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium truncate">{a.clients?.name}</p>
                          <p className="text-sm text-muted-foreground truncate">{a.services?.name}</p>
                        </div>
                      </div>
                      <StatusPill status={a.status} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, hint, accent }: { icon: any; label: string; value: number; hint?: string; accent?: boolean }) {
  return (
    <Card className={cn(accent && "border-primary/40")}>
      <CardContent className="pt-5 pb-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{label}</p>
          <Icon className={cn("size-4", accent ? "text-primary" : "text-muted-foreground/60")} strokeWidth={1.75} />
        </div>
        <p className="font-display text-3xl tracking-tight leading-none">{value}</p>
        {hint && <p className="text-xs text-muted-foreground mt-1.5">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function ChecklistItem({ done, label, to }: { done: boolean; label: string; to: string }) {
  return (
    <Link
      to={to as any}
      className={cn(
        "inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm border transition-colors",
        done
          ? "border-primary/30 bg-primary/10 text-foreground"
          : "border-border bg-background hover:bg-accent"
      )}
    >
      {done ? <CheckCircle2 className="size-3.5 text-primary" /> : <span className="size-3.5 rounded-full border border-muted-foreground/40" />}
      {label}
    </Link>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: "Pendiente", cls: "bg-amber-100 text-amber-800 border-amber-200" },
    booked: { label: "Confirmada", cls: "bg-primary/10 text-primary border-primary/20" },
    completed: { label: "Completada", cls: "bg-emerald-100 text-emerald-800 border-emerald-200" },
    cancelled: { label: "Cancelada", cls: "bg-rose-100 text-rose-800 border-rose-200" },
    no_show: { label: "No-show", cls: "bg-muted text-muted-foreground border-border" },
  };
  const s = map[status] ?? map.pending;
  return <span className={cn("text-[10px] uppercase tracking-wider font-semibold px-2 py-1 rounded-full border", s.cls)}>{s.label}</span>;
}

function PlanCard({
  plan,
  usage,
}: {
  plan: ReturnType<typeof getPlan>;
  usage: { appointmentsMonth: number; locations: number; professionals: number };
}) {
  const items: { label: string; used: number; limit: number | null }[] = [
    { label: "Citas este mes", used: usage.appointmentsMonth, limit: plan.limits.appointmentsPerMonth },
    { label: "Sucursales activas", used: usage.locations, limit: plan.limits.locations },
    { label: "Profesionales activos", used: usage.professionals, limit: plan.limits.professionals },
  ];
  const moduleKeys = Object.keys(plan.modules) as (keyof typeof plan.modules)[];
  const Icon = plan.id === "studio" ? Crown : plan.id === "pro" ? Sparkles : Lock;
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0 gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className={cn(
            "size-10 rounded-lg grid place-items-center shrink-0",
            plan.id === "studio" ? "bg-foreground text-background" : plan.id === "pro" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
          )}>
            <Icon className="size-5" strokeWidth={1.75} />
          </div>
          <div className="min-w-0">
            <CardTitle className="font-display text-xl">Plan {plan.label}</CardTitle>
            <CardDescription>{plan.tagline}</CardDescription>
          </div>
        </div>
        {plan.id !== "studio" && (
          <Button asChild variant="outline" size="sm">
            <Link to="/dashboard/planes">Mejorar plan <ArrowRight className="size-3.5" /></Link>
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <div className="grid sm:grid-cols-3 gap-3 mb-6">
          {items.map((it) => {
            const isUnlimited = it.limit === null;
            const pct = isUnlimited ? 0 : Math.min(100, Math.round((it.used / Math.max(1, it.limit!)) * 100));
            const reached = !isUnlimited && it.used >= (it.limit ?? 0);
            const warn = !isUnlimited && pct >= 80 && !reached;
            return (
              <div key={it.label} className="rounded-lg border border-border p-3 bg-background/40">
                <div className="flex items-baseline justify-between mb-2">
                  <p className="text-xs text-muted-foreground font-medium">{it.label}</p>
                  <p className="font-display text-sm tabular-nums">
                    {it.used}
                    <span className="text-muted-foreground">/{isUnlimited ? "∞" : it.limit}</span>
                  </p>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn(
                      "h-full transition-all",
                      isUnlimited ? "bg-primary/40 w-full" : reached ? "bg-rose-500" : warn ? "bg-amber-500" : "bg-primary"
                    )}
                    style={isUnlimited ? undefined : { width: `${pct}%` }}
                  />
                </div>
                {reached && <p className="text-[11px] text-rose-600 mt-1.5">Límite alcanzado</p>}
                {warn && <p className="text-[11px] text-amber-600 mt-1.5">Cerca del límite</p>}
              </div>
            );
          })}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Módulos incluidos</p>
          <ul className="grid sm:grid-cols-2 gap-y-1.5 gap-x-4">
            {moduleKeys.map((k) => {
              const on = plan.modules[k];
              return (
                <li key={k} className={cn("flex items-center gap-2 text-sm", !on && "text-muted-foreground/70")}>
                  {on ? (
                    <CheckCircle2 className="size-4 text-primary shrink-0" strokeWidth={2} />
                  ) : (
                    <Lock className="size-3.5 text-muted-foreground/50 shrink-0" strokeWidth={1.75} />
                  )}
                  <span className={cn(!on && "line-through decoration-muted-foreground/30")}>{MODULE_LABELS[k]}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}