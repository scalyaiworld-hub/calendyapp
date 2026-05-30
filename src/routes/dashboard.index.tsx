import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useMyBusiness } from "@/lib/business";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { SPA_CATALOG } from "@/lib/spa-catalog";
import { slugify, formatTime } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/")({
  component: DashboardHome,
});

function DashboardHome() {
  const { data: business, isLoading } = useMyBusiness();
  if (isLoading) return <p className="text-muted-foreground">Cargando…</p>;
  if (!business) return <Onboarding />;
  return <Summary businessId={business.id} />;
}

function Onboarding() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [loadCatalog, setLoadCatalog] = useState(true);

  const mut = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sin sesión");
      const slug = slugify(name) || `salon-${Math.random().toString(36).slice(2, 7)}`;
      const { data: biz, error } = await supabase
        .from("businesses")
        .insert({ name, slug, phone: phone || null, owner_id: user.id })
        .select()
        .single();
      if (error) throw error;

      // Default schedule Mon-Sat 9-19
      const rules = [1, 2, 3, 4, 5, 6].map((dow) => ({
        business_id: biz.id,
        day_of_week: dow,
        start_time: "09:00",
        end_time: "19:00",
      }));
      await supabase.from("availability_rules").insert(rules);

      if (loadCatalog) {
        const services = SPA_CATALOG.map((s, i) => ({
          business_id: biz.id,
          name: s.name,
          duration_minutes: s.duration_minutes,
          price_cents: s.price_cents,
          description: s.category,
          display_order: i,
        }));
        await supabase.from("services").insert(services);
      }
      return biz;
    },
    onSuccess: () => {
      toast.success("Salón creado");
      qc.invalidateQueries({ queryKey: ["my-business"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="max-w-xl">
      <h1 className="font-display text-3xl mb-2">Configura tu salón</h1>
      <p className="text-muted-foreground mb-6">Solo nos tomará un minuto.</p>
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div>
            <Label>Nombre del salón</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Spa Rosé" />
            {name && (
              <p className="text-xs text-muted-foreground mt-1">
                Tu página: /b/{slugify(name)}
              </p>
            )}
          </div>
          <div>
            <Label>Teléfono (opcional)</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+51 999 999 999" />
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox checked={loadCatalog} onCheckedChange={(v) => setLoadCatalog(!!v)} />
            Cargar catálogo sugerido de servicios spa ({SPA_CATALOG.length} servicios)
          </label>
          <Button
            onClick={() => mut.mutate()}
            disabled={!name || mut.isPending}
            className="w-full"
          >
            {mut.isPending ? "Creando…" : "Crear mi salón"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
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