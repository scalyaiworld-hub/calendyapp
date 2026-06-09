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
import { Plus, Pencil, Trash2, User, Search, Scissors, MapPin, Phone, Users } from "lucide-react";
import { PhoneInput } from "@/components/PhoneInput";
import { DEFAULT_COUNTRY_CODE } from "@/lib/countries";
import { ImagePicker, PRO_TEMPLATES } from "@/components/ImagePicker";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard/profesionales")({
  component: ProfesionalesPage,
});

function ProfesionalesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">Profesionales</h1>
        <p className="text-muted-foreground">Gestiona tu equipo y los servicios que ofrece cada persona.</p>
      </div>
      <ProsTab />
    </div>
  );
}

function ProsTab() {
  const { data: business } = useMyBusiness();
  const businessId = business?.id;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [search, setSearch] = useState("");

  const { data: pros, isLoading } = useQuery({
    queryKey: ["pros-full", businessId],
    enabled: !!businessId,
    queryFn: async () => (await supabase.from("professionals").select("*").eq("business_id", businessId!).is("deleted_at", null).order("created_at")).data ?? [],
  });

  const proIds = (pros ?? []).map((p) => p.id);
  const { data: svcCounts } = useQuery({
    queryKey: ["pro-svc-counts", businessId, proIds.join(",")],
    enabled: proIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("professional_services").select("professional_id").in("professional_id", proIds);
      const map: Record<string, number> = {};
      (data ?? []).forEach((r: any) => { map[r.professional_id] = (map[r.professional_id] ?? 0) + 1; });
      return map;
    },
  });
  const { data: locCounts } = useQuery({
    queryKey: ["pro-loc-counts", businessId, proIds.join(",")],
    enabled: proIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("location_professionals").select("professional_id").in("professional_id", proIds);
      const map: Record<string, number> = {};
      (data ?? []).forEach((r: any) => { map[r.professional_id] = (map[r.professional_id] ?? 0) + 1; });
      return map;
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("professionals").update({ deleted_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pros-full"] });
      qc.invalidateQueries({ queryKey: ["pros"] });
      qc.invalidateQueries({ queryKey: ["pros-count"] });
      qc.invalidateQueries({ queryKey: ["dashboard-ready-counts"] });
      toast.success("Eliminado");
    },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("professionals").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pros-full"] });
      qc.invalidateQueries({ queryKey: ["pros"] });
      qc.invalidateQueries({ queryKey: ["pros-count"] });
      qc.invalidateQueries({ queryKey: ["dashboard-ready-counts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="size-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar profesional…" className="pl-9" />
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground px-2">
          <span className="flex items-center gap-1.5"><Users className="size-3.5" />{pros?.length ?? 0} total</span>
          <span className="hidden sm:flex items-center gap-1.5 text-primary">
            <span className="size-1.5 rounded-full bg-primary" />
            {pros?.filter((p) => p.is_active !== false).length ?? 0} activos
          </span>
        </div>
        <Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="size-4 mr-1.5" /> Nuevo profesional</Button>
      </div>

      {isLoading ? (
        <ProGridSkeleton />
      ) : !pros?.length ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center space-y-3">
            <div className="size-14 rounded-2xl bg-primary/10 grid place-items-center mx-auto"><User className="size-6 text-primary" /></div>
            <div>
              <p className="font-medium">Aún no tienes profesionales</p>
              <p className="text-sm text-muted-foreground">Agrega a tu equipo para asignarles servicios y sucursales.</p>
            </div>
            <Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="size-4 mr-1.5" /> Agregar profesional</Button>
          </CardContent>
        </Card>
      ) : (() => {
        const q = search.trim().toLowerCase();
        const filtered = q ? pros.filter((p) => p.name?.toLowerCase().includes(q)) : pros;
        if (!filtered.length) return <p className="text-sm text-muted-foreground text-center py-6">Sin resultados.</p>;
        return (
          <div className="grid gap-3 md:grid-cols-2">
            {filtered.map((p) => (
              <Card key={p.id} className={cn("transition-all hover:shadow-md hover:border-primary/40", p.is_active === false && "opacity-60")}>
                <CardContent className="pt-4 pb-4 flex gap-3">
                  <div className="size-14 rounded-full overflow-hidden bg-gradient-to-br from-primary/20 to-primary/5 shrink-0 flex items-center justify-center text-primary font-medium">
                    {p.avatar_url ? (
                      <img src={p.avatar_url} alt={p.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-lg">{p.name?.charAt(0)?.toUpperCase() ?? <User className="size-5" />}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate">{p.name}</p>
                      {p.is_active === false && (
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Inactivo</span>
                      )}
                    </div>
                    {p.phone && <p className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="size-3" /> {p.phone_country_code} {p.phone}</p>}
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      <span className="text-[11px] inline-flex items-center gap-1 bg-muted px-2 py-0.5 rounded-full">
                        <Scissors className="size-3" /> {svcCounts?.[p.id] ?? 0} servicios
                      </span>
                      <span className="text-[11px] inline-flex items-center gap-1 bg-muted px-2 py-0.5 rounded-full">
                        <MapPin className="size-3" /> {locCounts?.[p.id] ?? 0} sucursales
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Switch
                      checked={p.is_active !== false}
                      onCheckedChange={(v) => toggleActive.mutate({ id: p.id, is_active: v })}
                      aria-label="Activo"
                    />
                    <div className="flex">
                      <Button size="icon" variant="ghost" onClick={() => { setEditing(p); setOpen(true); }}><Pencil className="size-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => { if (confirm("¿Eliminar profesional?")) del.mutate(p.id); }}><Trash2 className="size-4" /></Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        );
      })()}
      <ProDialog open={open} onOpenChange={setOpen} businessId={businessId} editing={editing} />
    </div>
  );
}

function ProDialog({ open, onOpenChange, businessId, editing }: { open: boolean; onOpenChange: (o: boolean) => void; businessId?: string; editing: any }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [countryCode, setCountryCode] = useState(DEFAULT_COUNTRY_CODE);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [selectedServices, setSelectedServices] = useState<Set<string>>(new Set());

  const { data: services } = useQuery({
    queryKey: ["services-for-pro", businessId],
    enabled: !!businessId,
    queryFn: async () => (await supabase.from("services").select("id,name").eq("business_id", businessId!).is("deleted_at", null).eq("is_active", true).order("display_order")).data ?? [],
  });

  useEffect(() => {
    if (!open) {
      setName(""); setPhone(""); setCountryCode(DEFAULT_COUNTRY_CODE); setAvatarUrl(null); setSelectedServices(new Set());
      return;
    }
    if (!editing) return;
    setName(editing.name ?? "");
    setPhone(editing.phone ?? "");
    setCountryCode(editing.phone_country_code ?? DEFAULT_COUNTRY_CODE);
    setAvatarUrl(editing.avatar_url ?? null);
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
          name, phone: phone || null, phone_country_code: phone ? countryCode : null, avatar_url: avatarUrl,
        }).eq("id", id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("professionals").insert({
          business_id: businessId, name, phone: phone || null, phone_country_code: phone ? countryCode : null, avatar_url: avatarUrl,
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pros-full"] });
      qc.invalidateQueries({ queryKey: ["pros"] });
      qc.invalidateQueries({ queryKey: ["pros-count"] });
      qc.invalidateQueries({ queryKey: ["dashboard-ready-counts"] });
      toast.success("Guardado");
      onOpenChange(false);
    },
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
          <ImagePicker
            value={avatarUrl}
            onChange={setAvatarUrl}
            templates={PRO_TEMPLATES}
            label="Foto del profesional"
            shape="circle"
            previewClassName="max-w-[140px]"
          />
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
