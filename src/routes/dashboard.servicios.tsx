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
import { Switch } from "@/components/ui/switch";
import { Pencil, Trash2, Plus, Sparkles } from "lucide-react";
import { SPA_CATALOG, SPA_CATEGORIES } from "@/lib/spa-catalog";
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
    mutationFn: async (selected: number[]) => {
      const offset = services?.length ?? 0;
      const rows = selected.map((i, idx) => ({
        business_id: businessId,
        name: SPA_CATALOG[i].name,
        duration_minutes: SPA_CATALOG[i].duration_minutes,
        price_cents: SPA_CATALOG[i].price_cents,
        description: SPA_CATALOG[i].category,
        display_order: offset + idx,
      }));
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
          <CatalogDialog onAdd={(sel) => addCatalog.mutate(sel)} />
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

function CatalogDialog({ onAdd }: { onAdd: (sel: number[]) => void }) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<Set<number>>(new Set());

  const toggle = (i: number) => {
    const n = new Set(sel);
    n.has(i) ? n.delete(i) : n.add(i);
    setSel(n);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSel(new Set()); }}>
      <DialogTrigger asChild>
        <Button variant="outline"><Sparkles className="size-4" /> Catálogo sugerido</Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Servicios sugeridos de spa</DialogTitle></DialogHeader>
        <div className="space-y-5">
          {SPA_CATEGORIES.map((cat) => (
            <div key={cat}>
              <h3 className="font-display text-lg mb-2">{cat}</h3>
              <div className="grid sm:grid-cols-2 gap-2">
                {SPA_CATALOG.map((s, i) => s.category === cat && (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggle(i)}
                    className={"text-left rounded-md border p-3 transition-colors " + (sel.has(i) ? "border-primary bg-primary/5" : "border-border hover:bg-accent")}
                  >
                    <p className="font-medium text-sm">{s.name}</p>
                    <p className="text-xs text-muted-foreground">{s.duration_minutes} min · {formatPriceCents(s.price_cents)}</p>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button disabled={sel.size === 0} onClick={() => { onAdd(Array.from(sel)); setOpen(false); }}>
            Agregar {sel.size} servicio{sel.size === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}