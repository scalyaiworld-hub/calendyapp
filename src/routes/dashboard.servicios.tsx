import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMyBusiness } from "@/lib/business";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Pencil, Trash2, Plus, Sparkles } from "lucide-react";
import { INDUSTRIES, SERVICE_TEMPLATES, type Industry } from "@/lib/service-templates";
import { formatPriceCents } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/servicios")({
  component: ServicesPage,
});

function ServicesPage() {
  const { data: business } = useMyBusiness();
  const qc = useQueryClient();
  const businessId = business?.id;

  const { data: services } = useQuery({
    queryKey: ["services", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("*")
        .eq("business_id", businessId!)
        .is("deleted_at", null)
        .order("display_order");
      if (error) throw error;
      return data;
    },
  });

  const upsert = useMutation({
    mutationFn: async (s: any) => {
      if (s.id) {
        const { error } = await supabase.from("services").update({
          name: s.name, duration_minutes: s.duration_minutes, price_cents: s.price_cents, is_active: s.is_active,
        }).eq("id", s.id);
        if (error) throw error;
      } else {
        if (!businessId) throw new Error("Sin negocio");
        const { error } = await supabase.from("services").insert({
          business_id: businessId, name: s.name, duration_minutes: s.duration_minutes, price_cents: s.price_cents,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["services"] }); toast.success("Guardado"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("services").update({ deleted_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["services"] }); toast.success("Eliminado"); },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("services").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["services"] }),
  });

  const addCatalog = useMutation({
    mutationFn: async (selected: { industry: Industry; name: string }[]) => {
      if (!businessId) throw new Error("Sin negocio");
      const offset = services?.length ?? 0;
      const rows = selected.map((sel, idx) => {
        const t = SERVICE_TEMPLATES[sel.industry].find((s) => s.name === sel.name)!;
        return {
          business_id: businessId,
          name: t.name,
          duration_minutes: t.duration_minutes,
          price_cents: t.price_cents,
          display_order: offset + idx,
        };
      });
      const { error } = await supabase.from("services").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["services"] }); toast.success("Servicios agregados"); },
  });

  if (!business) return <p className="text-muted-foreground">Primero crea tu salón.</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-2 flex-wrap">
        <div>
          <h1 className="font-display text-3xl mb-1">Servicios</h1>
          <p className="text-muted-foreground">Lo que ofreces a tus clientes.</p>
        </div>
        <div className="flex gap-2">
          <CatalogDialog defaultIndustry={(business as any)?.industry as Industry | undefined} onAdd={(sel) => addCatalog.mutate(sel)} />
          <ServiceDialog onSave={(s) => upsert.mutate(s)} trigger={<Button><Plus className="size-4" /> Nuevo</Button>} />
        </div>
      </div>

      {!services?.length ? (
        <Card><CardContent className="pt-6 text-center text-muted-foreground">Aún no tienes servicios. Crea uno o usa el catálogo sugerido.</CardContent></Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {services.map((s) => (
            <Card key={s.id} className={s.is_active ? "" : "opacity-60"}>
              <CardContent className="pt-5 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{s.name}</p>
                    <p className="text-xs text-muted-foreground">{s.description}</p>
                  </div>
                  <Switch checked={s.is_active} onCheckedChange={(v) => toggleActive.mutate({ id: s.id, is_active: v })} />
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{s.duration_minutes} min</span>
                  <span className="font-semibold text-primary">{formatPriceCents(s.price_cents)}</span>
                </div>
                <div className="flex gap-2 pt-1">
                  <ServiceDialog
                    initial={s}
                    onSave={(v) => upsert.mutate({ ...v, id: s.id })}
                    trigger={<Button variant="outline" size="sm"><Pencil className="size-3.5" /></Button>}
                  />
                  <Button variant="ghost" size="sm" onClick={() => { if (confirm("¿Eliminar este servicio?")) del.mutate(s.id); }}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function ServiceDialog({ initial, onSave, trigger }: { initial?: any; onSave: (s: any) => void; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initial?.name ?? "");
  const [duration, setDuration] = useState(initial?.duration_minutes ?? 30);
  const [price, setPrice] = useState((initial?.price_cents ?? 0) / 100);
  const [active, setActive] = useState(initial?.is_active ?? true);

  return (
    <Dialog open={open} onOpenChange={(v) => {
      setOpen(v);
      if (v && initial) { setName(initial.name); setDuration(initial.duration_minutes); setPrice(initial.price_cents/100); setActive(initial.is_active); }
      if (v && !initial) { setName(""); setDuration(30); setPrice(0); setActive(true); }
    }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{initial ? "Editar servicio" : "Nuevo servicio"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Nombre</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Duración (min)</Label><Input type="number" min={5} step={5} value={duration} onChange={(e) => setDuration(Number(e.target.value))} /></div>
            <div><Label>Precio (S/.)</Label><Input type="number" min={0} step={1} value={price} onChange={(e) => setPrice(Number(e.target.value))} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => { onSave({ name, duration_minutes: duration, price_cents: Math.round(price * 100), is_active: active }); setOpen(false); }} disabled={!name || duration < 1}>
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CatalogDialog({ defaultIndustry, onAdd }: { defaultIndustry?: Industry; onAdd: (sel: { industry: Industry; name: string }[]) => void }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Industry>(defaultIndustry ?? "peluqueria");
  const [sel, setSel] = useState<Set<string>>(new Set());

  const key = (ind: Industry, name: string) => `${ind}::${name}`;
  const toggle = (ind: Industry, name: string) => {
    const k = key(ind, name);
    const n = new Set(sel);
    n.has(k) ? n.delete(k) : n.add(k);
    setSel(n);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSel(new Set()); if (v && defaultIndustry) setTab(defaultIndustry); }}>
      <DialogTrigger asChild>
        <Button variant="outline"><Sparkles className="size-4" /> Plantillas</Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Plantillas de servicios por rubro</DialogTitle>
        </DialogHeader>
        <Tabs value={tab} onValueChange={(v) => setTab(v as Industry)} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="flex-wrap h-auto justify-start">
            {INDUSTRIES.map((ind) => (
              <TabsTrigger key={ind.id} value={ind.id} className="gap-1.5">
                <span>{ind.emoji}</span>
                <span>{ind.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
          {INDUSTRIES.map((ind) => (
            <TabsContent key={ind.id} value={ind.id} className="flex-1 overflow-y-auto mt-4">
              <div className="grid sm:grid-cols-2 gap-2">
                {SERVICE_TEMPLATES[ind.id].map((s) => {
                  const k = key(ind.id, s.name);
                  const checked = sel.has(k);
                  return (
                    <button
                      key={s.name}
                      type="button"
                      onClick={() => toggle(ind.id, s.name)}
                      className={"text-left rounded-md border p-3 transition-colors " + (checked ? "border-primary bg-primary/5" : "border-border hover:bg-accent")}
                    >
                      <p className="font-medium text-sm">{s.name}</p>
                      <p className="text-xs text-muted-foreground">{s.duration_minutes} min · {formatPriceCents(s.price_cents)}</p>
                    </button>
                  );
                })}
              </div>
            </TabsContent>
          ))}
        </Tabs>
        <DialogFooter>
          <Button disabled={sel.size === 0} onClick={() => {
            const list = Array.from(sel).map((k) => {
              const [ind, name] = k.split("::");
              return { industry: ind as Industry, name };
            });
            onAdd(list);
            setOpen(false);
          }}>
            Importar {sel.size} servicio{sel.size === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}