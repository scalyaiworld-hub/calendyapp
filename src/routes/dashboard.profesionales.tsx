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
import { Plus, Pencil, Trash2 } from "lucide-react";
import { PhoneInput } from "@/components/PhoneInput";
import { DEFAULT_COUNTRY_CODE } from "@/lib/countries";
import { toast } from "sonner";

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
