import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMyBusiness } from "@/lib/business";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatTime } from "@/lib/format";

export const Route = createFileRoute("/dashboard/")({
  component: DashboardHome,
});

function DashboardHome() {
  const { data: business, isLoading } = useMyBusiness();
  if (isLoading) return <p className="text-muted-foreground">Cargando…</p>;
  if (!business) return null; // layout already redirects to /onboarding
  return <Summary businessId={business.id} />;
}

function Summary({ businessId }: { businessId: string }) {
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
      const [services, clients] = await Promise.all([
        supabase.from("services").select("id", { count: "exact", head: true }).eq("business_id", businessId).is("deleted_at", null),
        supabase.from("clients").select("id", { count: "exact", head: true }).eq("business_id", businessId).is("deleted_at", null),
      ]);
      return { services: services.count ?? 0, clients: clients.count ?? 0 };
    },
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl mb-1">Resumen</h1>
        <p className="text-muted-foreground">Tu salón de hoy en un vistazo.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Stat label="Citas hoy" value={today?.length ?? 0} />
        <Stat label="Servicios" value={counts?.services ?? 0} />
        <Stat label="Clientes" value={counts?.clients ?? 0} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-xl">Citas de hoy</CardTitle>
          <CardDescription>{new Date().toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" })}</CardDescription>
        </CardHeader>
        <CardContent>
          {!today?.length ? (
            <p className="text-sm text-muted-foreground">No hay citas hoy. <Link to="/dashboard/agenda" className="text-primary underline">Crear una</Link></p>
          ) : (
            <ul className="divide-y divide-border">
              {today.map((a: any) => (
                <li key={a.id} className="py-3 flex items-center justify-between">
                  <div>
                    <p className="font-medium">{formatTime(a.starts_at)} · {a.clients?.name}</p>
                    <p className="text-sm text-muted-foreground">{a.services?.name}</p>
                  </div>
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">{a.status}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="font-display text-3xl mt-1">{value}</p>
      </CardContent>
    </Card>
  );
}