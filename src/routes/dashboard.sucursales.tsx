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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, Trash2, MapPin, User2 } from "lucide-react";
import { PhoneInput } from "@/components/PhoneInput";
import { DEFAULT_COUNTRY_CODE } from "@/lib/countries";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/sucursales")({
  component: SucursalesPage,
});

const DAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function SucursalesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">Sucursales</h1>
        <p className="text-muted-foreground">Gestiona tus locales, horarios y profesionales.</p>
      </div>
      <Tabs defaultValue="locations">
        <TabsList>
          <TabsTrigger value="locations"><MapPin className="size-4 mr-1.5" /> Sucursales</TabsTrigger>
          <TabsTrigger value="pros"><User2 className="size-4 mr-1.5" /> Profesionales</TabsTrigger>
        </TabsList>
        <TabsContent value="locations" className="mt-4"><LocationsTab /></TabsContent>
        <TabsContent value="pros" className="mt-4"><ProsTab /></TabsContent>
      </Tabs>
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

  const { data: locations } = useQuery({
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

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("locations").update({ deleted_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["locations"] }); toast.success("Sucursal eliminada"); },
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="size-4 mr-1.5" /> Nueva sucursal</Button>
      </div>

      {!locations?.length ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">
          Aún no tienes sucursales. Crea la primera para empezar.
        </CardContent></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {locations.map((l) => (
            <Card key={l.id}>
              <CardContent className="pt-4 pb-4 flex justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium truncate">{l.name}</p>
                  {l.address && <p className="text-sm text-muted-foreground truncate">{l.address}</p>}
                  {l.phone && <p className="text-xs text-muted-foreground">{l.phone_country_code} {l.phone}</p>}
                  <p className="text-xs text-muted-foreground mt-1">{assignCounts?.[l.id] ?? 0} profesional(es)</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="icon" variant="ghost" onClick={() => { setEditing(l); setOpen(true); }}><Pencil className="size-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => { if (confirm("¿Eliminar sucursal?")) del.mutate(l.id); }}><Trash2 className="size-4" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

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
      setHours(Array.from({ length: 7 }, () => ({ open: true, start: "09:00", end: "18:00" })));
      setSelectedPros(new Set());
      return;
    }
    if (!editing) return;
    setName(editing.name ?? "");
    setAddress(editing.address ?? "");
    setPhone(editing.phone ?? "");
    setCountryCode(editing.phone_country_code ?? DEFAULT_COUNTRY_CODE);
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
          name, address: address || null, phone: phone || null, phone_country_code: phone ? countryCode : null,
        }).eq("id", id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("locations").insert({
          business_id: businessId, name, address: address || null, phone: phone || null, phone_country_code: phone ? countryCode : null,
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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["locations"] }); qc.invalidateQueries({ queryKey: ["loc-pro-counts"] }); toast.success("Guardado"); onOpenChange(false); },
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

/* ------------------------- Professionals ------------------------- */
function ProsTab() {
  const { data: business } = useMyBusiness();
  const businessId = business?.id;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  const { data: pros } = useQuery({
    queryKey: ["pros-full", businessId],
    enabled: !!businessId,
    queryFn: async () => (await supabase.from("professionals").select("*").eq("business_id", businessId!).is("deleted_at", null).order("created_at")).data ?? [],
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("professionals").update({ deleted_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["pros-full"] }); qc.invalidateQueries({ queryKey: ["pros"] }); toast.success("Eliminado"); },
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="size-4 mr-1.5" /> Nuevo profesional</Button>
      </div>
      {!pros?.length ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">
          Aún no tienes profesionales. Agrega uno para asignarlo a sucursales y servicios.
        </CardContent></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {pros.map((p) => (
            <Card key={p.id}>
              <CardContent className="pt-4 pb-4 flex justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium truncate">{p.name}</p>
                  {p.phone && <p className="text-xs text-muted-foreground">{p.phone_country_code} {p.phone}</p>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="icon" variant="ghost" onClick={() => { setEditing(p); setOpen(true); }}><Pencil className="size-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => { if (confirm("¿Eliminar profesional?")) del.mutate(p.id); }}><Trash2 className="size-4" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <ProDialog open={open} onOpenChange={setOpen} businessId={businessId} editing={editing} />
    </div>
  );
}

function ProDialog({ open, onOpenChange, businessId, editing }: { open: boolean; onOpenChange: (o: boolean) => void; businessId?: string; editing: any }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [countryCode, setCountryCode] = useState(DEFAULT_COUNTRY_CODE);
  const [selectedServices, setSelectedServices] = useState<Set<string>>(new Set());

  const { data: services } = useQuery({
    queryKey: ["services-for-pro", businessId],
    enabled: !!businessId,
    queryFn: async () => (await supabase.from("services").select("id,name").eq("business_id", businessId!).is("deleted_at", null).eq("is_active", true).order("display_order")).data ?? [],
  });

  useEffect(() => {
    if (!open) {
      setName(""); setPhone(""); setCountryCode(DEFAULT_COUNTRY_CODE); setSelectedServices(new Set());
      return;
    }
    if (!editing) return;
    setName(editing.name ?? "");
    setPhone(editing.phone ?? "");
    setCountryCode(editing.phone_country_code ?? DEFAULT_COUNTRY_CODE);
    (async () => {
      const { data } = await supabase.from("professional_services").select("service_id").eq("professional_id", editing.id);
      setSelectedServices(new Set((data ?? []).map((x: any) => x.service_id)));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.id]);

  const save = useMutation({
    mutationFn: async () => {
      if (!businessId) throw new Error("Sin negocio");
      if (!name.trim()) throw new Error("Nombre requerido");
      let id = editing?.id as string | undefined;
      if (id) {
        const { error } = await supabase.from("professionals").update({
          name, phone: phone || null, phone_country_code: phone ? countryCode : null,
        }).eq("id", id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("professionals").insert({
          business_id: businessId, name, phone: phone || null, phone_country_code: phone ? countryCode : null,
        }).select().single();
        if (error) throw error;
        id = data.id;
      }
      await supabase.from("professional_services").delete().eq("professional_id", id!);
      if (selectedServices.size) {
        const { error } = await supabase.from("professional_services").insert(
          Array.from(selectedServices).map((sid) => ({ professional_id: id!, service_id: sid }))
        );
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["pros-full"] }); qc.invalidateQueries({ queryKey: ["pros"] }); toast.success("Guardado"); onOpenChange(false); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editing ? "Editar profesional" : "Nuevo profesional"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div><Label>Nombre</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ana Pérez" /></div>
          <div>
            <Label>Teléfono (opcional)</Label>
            <div className="mt-1.5"><PhoneInput countryCode={countryCode} number={phone} onCountryCodeChange={setCountryCode} onNumberChange={setPhone} /></div>
          </div>
          <div>
            <Label className="mb-2 block">Servicios que ofrece</Label>
            {!services?.length ? (
              <p className="text-sm text-muted-foreground">No hay servicios activos. Crea servicios primero.</p>
            ) : (
              <div className="grid grid-cols-1 gap-2 max-h-60 overflow-y-auto pr-1">
                {services.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={selectedServices.has(s.id)} onCheckedChange={(v) => setSelectedServices((set) => { const n = new Set(set); v ? n.add(s.id) : n.delete(s.id); return n; })} />
                    {s.name}
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