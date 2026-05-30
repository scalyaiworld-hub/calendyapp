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
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/clientes")({
  component: ClientsPage,
});

function ClientsPage() {
  const { data: business } = useMyBusiness();
  const qc = useQueryClient();
  const [q, setQ] = useState("");

  const { data: clients } = useQuery({
    queryKey: ["clients", business?.id, q],
    enabled: !!business?.id,
    queryFn: async () => {
      let query = supabase.from("clients").select("*").eq("business_id", business!.id).is("deleted_at", null).order("name");
      if (q) query = query.or(`name.ilike.%${q}%,phone.ilike.%${q}%`);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const upsert = useMutation({
    mutationFn: async (c: any) => {
      if (c.id) {
        const { error } = await supabase.from("clients").update({ name: c.name, phone: c.phone, email: c.email || null, notes: c.notes || null }).eq("id", c.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("clients").insert({ business_id: business!.id, name: c.name, phone: c.phone, email: c.email || null, notes: c.notes || null });
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["clients"] }); toast.success("Guardado"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("clients").update({ deleted_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["clients"] }); toast.success("Eliminado"); },
  });

  if (!business) return <p className="text-muted-foreground">Primero crea tu salón.</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-2 flex-wrap">
        <div>
          <h1 className="font-display text-3xl mb-1">Clientes</h1>
          <p className="text-muted-foreground">Tu base de clientes.</p>
        </div>
        <ClientDialog onSave={(c) => upsert.mutate(c)} trigger={<Button><Plus className="size-4" /> Nuevo</Button>} />
      </div>

      <Input placeholder="Buscar por nombre o teléfono…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-md" />

      {!clients?.length ? (
        <Card><CardContent className="pt-6 text-center text-muted-foreground">Sin clientes aún.</CardContent></Card>
      ) : (
        <Card>
          <CardContent className="pt-4">
            <ul className="divide-y divide-border">
              {clients.map((c) => (
                <li key={c.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{c.name}</p>
                    <p className="text-sm text-muted-foreground truncate">{c.phone}{c.email ? ` · ${c.email}` : ""}</p>
                    <p className="text-xs text-muted-foreground">{c.total_appointments} cita(s) · {c.no_show_count} no-show</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <ClientDialog initial={c} onSave={(v) => upsert.mutate({ ...v, id: c.id })} trigger={<Button size="sm" variant="outline"><Pencil className="size-3.5" /></Button>} />
                    <Button size="sm" variant="ghost" onClick={() => { if (confirm("¿Eliminar cliente?")) del.mutate(c.id); }}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ClientDialog({ initial, onSave, trigger }: { initial?: any; onSave: (c: any) => void; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initial?.name ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  return (
    <Dialog open={open} onOpenChange={(v) => {
      setOpen(v);
      if (v && initial) { setName(initial.name); setPhone(initial.phone); setEmail(initial.email ?? ""); setNotes(initial.notes ?? ""); }
      if (v && !initial) { setName(""); setPhone(""); setEmail(""); setNotes(""); }
    }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{initial ? "Editar cliente" : "Nuevo cliente"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Nombre</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><Label>Teléfono</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          <div><Label>Email (opcional)</Label><Input value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div><Label>Notas</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button onClick={() => { onSave({ name, phone, email, notes }); setOpen(false); }} disabled={!name || !phone}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}