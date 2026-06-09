import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMyBusiness } from "@/lib/business";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, Trash2, MapPin, Search, Users, Phone, Clock, Store } from "lucide-react";
import { PhoneInput } from "@/components/PhoneInput";
import { DEFAULT_COUNTRY_CODE } from "@/lib/countries";
import { ImagePicker, LOCATION_TEMPLATES } from "@/components/ImagePicker";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CardGridSkeleton } from "@/components/Skeletons";

export const Route = createFileRoute("/dashboard/sucursales")({
  component: SucursalesPage,
});

const DAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function SucursalesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">Sucursales</h1>
        <p className="text-muted-foreground">Gestiona tus locales y horarios de atención.</p>
      </div>
      <LocationsTab />
    </div>
  );
}

/* ------------------------- Locations ------------------------- */
function LocationsTab() {
  const { data: business } = useMyBusiness();
  const businessId = business?.id;
  const qc = useQueryClient();
  const [editing, setEditing] = useState<any | null>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data: locations, isLoading } = useQuery({
    queryKey: ["locations", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("locations").select("*")
        .eq("business_id", businessId!).is("deleted_at", null)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const { data: assignCounts } = useQuery({
    queryKey: ["loc-pro-counts", businessId],
    enabled: !!locations?.length,
    queryFn: async () => {
      const ids = locations!.map((l) => l.id);
      const { data } = await supabase.from("location_professionals").select("location_id").in("location_id", ids);
      const counts: Record<string, number> = {};
      (data ?? []).forEach((r: any) => { counts[r.location_id] = (counts[r.location_id] ?? 0) + 1; });
      return counts;
    },
  });

  const { data: hoursByLoc } = useQuery({
    queryKey: ["loc-hours-summary", businessId],
    enabled: !!locations?.length,
    queryFn: async () => {
      const ids = locations!.map((l) => l.id);
      const { data } = await supabase.from("location_hours").select("location_id,day_of_week,start_time,end_time").in("location_id", ids);
      const map: Record<string, { day_of_week: number; start_time: string; end_time: string }[]> = {};
      (data ?? []).forEach((r: any) => {
        (map[r.location_id] ??= []).push(r);
      });
      return map;
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("locations").update({ deleted_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["locations"] });
      qc.invalidateQueries({ queryKey: ["locations-count"] });
      qc.invalidateQueries({ queryKey: ["public-locations"] });
      toast.success("Sucursal eliminada");
    },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("locations").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["locations"] });
      qc.invalidateQueries({ queryKey: ["locations-count"] });
      qc.invalidateQueries({ queryKey: ["public-locations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="size-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre o dirección…" className="pl-9" />
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground px-2">
          <span className="flex items-center gap-1.5"><Store className="size-3.5" />{locations?.length ?? 0} total</span>
          <span className="hidden sm:flex items-center gap-1.5 text-primary">
            <span className="size-1.5 rounded-full bg-primary" />
            {locations?.filter((l) => l.is_active !== false).length ?? 0} activas
          </span>
        </div>
        <Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="size-4 mr-1.5" /> Nueva sucursal</Button>
      </div>

      {isLoading ? (
        <CardGridSkeleton count={4} />
      ) : !locations?.length ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center space-y-3">
            <div className="size-14 rounded-2xl bg-primary/10 grid place-items-center mx-auto"><MapPin className="size-6 text-primary" /></div>
            <div>
              <p className="font-medium">Aún no tienes sucursales</p>
              <p className="text-sm text-muted-foreground">Crea la primera para que tus clientes puedan elegir dónde atenderse.</p>
            </div>
            <Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="size-4 mr-1.5" /> Crear sucursal</Button>
          </CardContent>
        </Card>
      ) : (() => {
        const q = search.trim().toLowerCase();
        const filtered = q ? locations.filter((l) => l.name?.toLowerCase().includes(q) || l.address?.toLowerCase().includes(q)) : locations;
        if (!filtered.length) return <p className="text-sm text-muted-foreground text-center py-6">Sin resultados para “{search}”.</p>;
        return (
          <div className="grid gap-3 md:grid-cols-2">
            {filtered.map((l) => {
              const hours = hoursByLoc?.[l.id] ?? [];
              const daysOpen = hours.length;
              const sample = hours[0];
              return (
                <Card key={l.id} className={cn("transition-all hover:shadow-md hover:border-primary/40", l.is_active === false && "opacity-60")}>
                  <CardContent className="pt-4 pb-4 flex gap-3">
                    <div className="size-16 rounded-xl overflow-hidden bg-muted shrink-0 flex items-center justify-center">
                      {l.image_url ? (
                        <img src={l.image_url} alt={l.name} className="w-full h-full object-cover" />
                      ) : (
                        <MapPin className="size-6 text-muted-foreground/50" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <p className="font-medium truncate">{l.name}</p>
                        {l.is_active === false && (
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Inactiva</span>
                        )}
                      </div>
                      {l.address && <p className="text-xs text-muted-foreground truncate flex items-center gap-1"><MapPin className="size-3 shrink-0" /> {l.address}</p>}
                      {l.phone && <p className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="size-3" /> {l.phone_country_code} {l.phone}</p>}
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        <span className="text-[11px] inline-flex items-center gap-1 bg-muted px-2 py-0.5 rounded-full">
                          <Users className="size-3" /> {assignCounts?.[l.id] ?? 0}
                        </span>
                        {daysOpen > 0 && sample && (
                          <span className="text-[11px] inline-flex items-center gap-1 bg-muted px-2 py-0.5 rounded-full">
                            <Clock className="size-3" /> {sample.start_time.slice(0,5)}–{sample.end_time.slice(0,5)} · {daysOpen}d
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <Switch
                        checked={l.is_active !== false}
                        onCheckedChange={(v) => toggleActive.mutate({ id: l.id, is_active: v })}
                        aria-label="Activa"
                      />
                      <div className="flex">
                        <Button size="icon" variant="ghost" onClick={() => { setEditing(l); setOpen(true); }}><Pencil className="size-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => { if (confirm("¿Eliminar sucursal?")) del.mutate(l.id); }}><Trash2 className="size-4" /></Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        );
      })()}

      <LocationDialog open={open} onOpenChange={setOpen} businessId={businessId} editing={editing} />
    </div>
  );
}

function LocationDialog({ open, onOpenChange, businessId, editing }: { open: boolean; onOpenChange: (o: boolean) => void; businessId?: string; editing: any }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [countryCode, setCountryCode] = useState(DEFAULT_COUNTRY_CODE);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [hours, setHours] = useState<{ open: boolean; start: string; end: string }[]>(
    () => Array.from({ length: 7 }, () => ({ open: true, start: "09:00", end: "18:00" }))
  );
  const [selectedPros, setSelectedPros] = useState<Set<string>>(new Set());

  const { data: pros } = useQuery({
    queryKey: ["pros", businessId],
    enabled: !!businessId,
    queryFn: async () => (await supabase.from("professionals").select("id,name").eq("business_id", businessId!).is("deleted_at", null)).data ?? [],
  });

  useEffect(() => {
    if (!open) {
      setName(""); setAddress(""); setPhone(""); setCountryCode(DEFAULT_COUNTRY_CODE);
      setImageUrl(null);
      setHours(Array.from({ length: 7 }, () => ({ open: true, start: "09:00", end: "18:00" })));
      setSelectedPros(new Set());
      return;
    }
    if (!editing) return;
    setName(editing.name ?? "");
    setAddress(editing.address ?? "");
    setPhone(editing.phone ?? "");
    setCountryCode(editing.phone_country_code ?? DEFAULT_COUNTRY_CODE);
    setImageUrl(editing.image_url ?? null);
    (async () => {
      const { data: lh } = await supabase.from("location_hours").select("*").eq("location_id", editing.id);
      if (lh) {
        setHours((prev) => {
          const next = prev.map((h) => ({ open: false, start: h.start, end: h.end }));
          lh.forEach((row: any) => { next[row.day_of_week] = { open: true, start: String(row.start_time).slice(0,5), end: String(row.end_time).slice(0,5) }; });
          return next;
        });
      }
      const { data: lp } = await supabase.from("location_professionals").select("professional_id").eq("location_id", editing.id);
      setSelectedPros(new Set((lp ?? []).map((x: any) => x.professional_id)));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.id]);

  const save = useMutation({
    mutationFn: async () => {
      if (!businessId) throw new Error("Sin negocio");
      if (!name.trim()) throw new Error("Nombre requerido");
      let id = editing?.id as string | undefined;
      if (id) {
        const { error } = await supabase.from("locations").update({
          name, address: address || null, phone: phone || null, phone_country_code: phone ? countryCode : null, image_url: imageUrl,
        }).eq("id", id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("locations").insert({
          business_id: businessId, name, address: address || null, phone: phone || null, phone_country_code: phone ? countryCode : null, image_url: imageUrl,
        }).select().single();
        if (error) throw error;
        id = data.id;
      }
      // hours: replace all
      await supabase.from("location_hours").delete().eq("location_id", id!);
      const rows = hours.flatMap((h, i) => h.open ? [{ location_id: id!, day_of_week: i, start_time: h.start, end_time: h.end }] : []);
      if (rows.length) {
        const { error } = await supabase.from("location_hours").insert(rows);
        if (error) throw error;
      }
      // pros: replace all
      await supabase.from("location_professionals").delete().eq("location_id", id!);
      if (selectedPros.size) {
        const { error } = await supabase.from("location_professionals").insert(
          Array.from(selectedPros).map((pid) => ({ location_id: id!, professional_id: pid }))
        );
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["locations"] });
      qc.invalidateQueries({ queryKey: ["locations-count"] });
      qc.invalidateQueries({ queryKey: ["loc-pro-counts"] });
      qc.invalidateQueries({ queryKey: ["public-locations"] });
      toast.success("Guardado");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editing ? "Editar sucursal" : "Nueva sucursal"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div><Label>Nombre</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Sede Miraflores" /></div>
          <div><Label>Dirección</Label><Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Av. Principal 123" /></div>
          <div>
            <Label>Teléfono</Label>
            <div className="mt-1.5"><PhoneInput countryCode={countryCode} number={phone} onCountryCodeChange={setCountryCode} onNumberChange={setPhone} /></div>
          </div>
          <ImagePicker
            value={imageUrl}
            onChange={setImageUrl}
            templates={LOCATION_TEMPLATES}
            label="Imagen de la sucursal"
            shape="rounded"
          />
          <div>
            <Label className="mb-2 block">Horario de atención</Label>
            <div className="space-y-2">
              {hours.map((h, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-12 text-sm text-muted-foreground">{DAYS[i]}</div>
                  <Switch checked={h.open} onCheckedChange={(v) => setHours((arr) => arr.map((x, j) => j === i ? { ...x, open: v } : x))} />
                  {h.open ? (
                    <>
                      <Input type="time" value={h.start} onChange={(e) => setHours((arr) => arr.map((x, j) => j === i ? { ...x, start: e.target.value } : x))} className="w-28" />
                      <span className="text-muted-foreground">—</span>
                      <Input type="time" value={h.end} onChange={(e) => setHours((arr) => arr.map((x, j) => j === i ? { ...x, end: e.target.value } : x))} className="w-28" />
                    </>
                  ) : <span className="text-sm text-muted-foreground">Cerrado</span>}
                </div>
              ))}
            </div>
          </div>
          <div>
            <Label className="mb-2 block">Profesionales asignados</Label>
            {!pros?.length ? (
              <p className="text-sm text-muted-foreground">Crea profesionales en la pestaña "Profesionales" primero.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {pros.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={selectedPros.has(p.id)} onCheckedChange={(v) => setSelectedPros((s) => { const n = new Set(s); v ? n.add(p.id) : n.delete(p.id); return n; })} />
                    {p.name}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Guardando…" : "Guardar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
