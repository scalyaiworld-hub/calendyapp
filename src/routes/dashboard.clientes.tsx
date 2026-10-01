import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMyBusiness } from "@/lib/business";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, Search, MessageCircle, Users, UserPlus, Star, AlertTriangle, CalendarClock, Mail } from "lucide-react";
import { toast } from "sonner";
import { translateDbError } from "@/lib/api/error-messages";
import { PhoneInput, formatPhone } from "@/components/PhoneInput";
import { DEFAULT_COUNTRY_CODE } from "@/lib/countries";
import { invalidateClients } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { formatTime, formatPriceCents } from "@/lib/format";
import { apptPriceCents } from "@/lib/appointments";
import { CardListSkeleton } from "@/components/Skeletons";

export const Route = createFileRoute("/dashboard/clientes")({
  component: ClientsPage,
});

type Filter = "all" | "new" | "frequent" | "inactive" | "no_shows";
type Sort = "name" | "recent" | "most" | "created";

function initials(name?: string | null) {
  if (!name) return "?";
  return name.trim().split(/\s+/).slice(0, 2).map((s) => s[0]?.toUpperCase() ?? "").join("");
}
function daysSince(iso?: string | null) {
  if (!iso) return Infinity;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}
function formatLastVisit(iso?: string | null) {
  if (!iso) return "Nunca";
  const d = daysSince(iso);
  if (d === 0) return "Hoy";
  if (d === 1) return "Ayer";
  if (d < 7) return `Hace ${d} días`;
  if (d < 30) return `Hace ${Math.floor(d / 7)} sem.`;
  if (d < 365) return `Hace ${Math.floor(d / 30)} meses`;
  return `Hace ${Math.floor(d / 365)} año(s)`;
}
function waLink(country?: string | null, phone?: string | null) {
  if (!phone) return null;
  const cc = (country ?? "").replace(/\D/g, "");
  const num = phone.replace(/\D/g, "");
  if (!num) return null;
  return `https://wa.me/${cc}${num}`;
}

function ClientsPage() {
  const { data: business } = useMyBusiness();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("name");
  const [detailClient, setDetailClient] = useState<any>(null);

  const { data: clients, isLoading } = useQuery({
    queryKey: ["clients", business?.id],
    enabled: !!business?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("business_id", business!.id)
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const upsert = useMutation({
    mutationFn: async (c: any) => {
      if (c.id) {
        const { error } = await supabase
          .from("clients")
          .update({
            name: c.name,
            phone: c.phone,
            phone_country_code: c.phone_country_code,
            email: c.email || null,
            notes: c.notes || null,
          })
          .eq("id", c.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("clients")
          .insert({
            business_id: business!.id,
            name: c.name,
            phone: c.phone,
            phone_country_code: c.phone_country_code,
            email: c.email || null,
            notes: c.notes || null,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => { invalidateClients(qc); toast.success("Guardado"); },
    onError: (e: Error) => toast.error(translateDbError(e)),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("clients").update({ deleted_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidateClients(qc); toast.success("Eliminado"); },
  });

  const stats = useMemo(() => {
    const list = clients ?? [];
    const now = Date.now();
    const monthAgo = now - 30 * 86400000;
    const newThisMonth = list.filter((c: any) => new Date(c.created_at).getTime() >= monthAgo).length;
    const frequent = list.filter((c: any) => (c.total_appointments ?? 0) >= 3).length;
    const inactive = list.filter((c: any) => c.last_visit_at && daysSince(c.last_visit_at) > 90).length;
    return { total: list.length, newThisMonth, frequent, inactive };
  }, [clients]);

  const filtered = useMemo(() => {
    let list = (clients ?? []) as any[];
    if (q.trim()) {
      const s = q.toLowerCase();
      list = list.filter(
        (c) => c.name?.toLowerCase().includes(s) || c.phone?.toLowerCase().includes(s) || c.email?.toLowerCase().includes(s),
      );
    }
    if (filter === "new") {
      const monthAgo = Date.now() - 30 * 86400000;
      list = list.filter((c) => new Date(c.created_at).getTime() >= monthAgo);
    } else if (filter === "frequent") {
      list = list.filter((c) => (c.total_appointments ?? 0) >= 3);
    } else if (filter === "inactive") {
      list = list.filter((c) => c.last_visit_at && daysSince(c.last_visit_at) > 90);
    } else if (filter === "no_shows") {
      list = list.filter((c) => (c.no_show_count ?? 0) > 0);
    }
    list = [...list].sort((a, b) => {
      if (sort === "name") return (a.name ?? "").localeCompare(b.name ?? "");
      if (sort === "recent") return daysSince(a.last_visit_at) - daysSince(b.last_visit_at);
      if (sort === "most") return (b.total_appointments ?? 0) - (a.total_appointments ?? 0);
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    return list;
  }, [clients, q, filter, sort]);

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

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={<Users className="size-4" />} label="Total" value={stats.total} />
        <StatCard icon={<UserPlus className="size-4" />} label="Nuevos (30d)" value={stats.newThisMonth} tone="primary" />
        <StatCard icon={<Star className="size-4" />} label="Frecuentes" value={stats.frequent} tone="success" />
        <StatCard icon={<AlertTriangle className="size-4" />} label="Inactivos +90d" value={stats.inactive} tone="warning" />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input placeholder="Buscar por nombre, teléfono o email…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
        </div>
        <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
          <SelectTrigger className="w-full sm:w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="name">Alfabético</SelectItem>
            <SelectItem value="recent">Última visita</SelectItem>
            <SelectItem value="most">Más citas</SelectItem>
            <SelectItem value="created">Más recientes</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex gap-1.5 flex-wrap -mt-2">
        {(
          [
            ["all", `Todos (${stats.total})`],
            ["new", `Nuevos (${stats.newThisMonth})`],
            ["frequent", `Frecuentes (${stats.frequent})`],
            ["inactive", `Inactivos (${stats.inactive})`],
            ["no_shows", "Con no-shows"],
          ] as [Filter, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={cn(
              "px-3 py-1 text-xs rounded-full border transition",
              filter === key
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-border hover:text-foreground hover:border-foreground/30",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <CardListSkeleton rows={6} withAvatar />
      ) : !clients?.length ? (
        <Card className="border-dashed">
          <CardContent className="pt-10 pb-10 text-center space-y-3">
            <div className="mx-auto size-12 rounded-full bg-primary/10 text-primary flex items-center justify-center">
              <Users className="size-5" />
            </div>
            <p className="text-sm text-muted-foreground">Aún no tienes clientes registrados.</p>
            <ClientDialog onSave={(c) => upsert.mutate(c)} trigger={<Button size="sm"><Plus className="size-4" /> Agregar primer cliente</Button>} />
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="pt-6 pb-6 text-center text-sm text-muted-foreground">No hay resultados con esos filtros.</CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {filtered.map((c: any) => {
                const wa = waLink(c.phone_country_code, c.phone);
                const isFrequent = (c.total_appointments ?? 0) >= 3;
                const hasNoShows = (c.no_show_count ?? 0) > 0;
                return (
                  <li key={c.id} className="px-4 py-3 flex items-center gap-3 hover:bg-muted/30 transition-colors">
                    <button
                      type="button"
                      onClick={() => setDetailClient(c)}
                      className="size-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 text-primary font-semibold flex items-center justify-center shrink-0 text-sm hover:ring-2 hover:ring-primary/30 transition"
                    >
                      {initials(c.name)}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDetailClient(c)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="font-medium truncate">{c.name}</p>
                        {isFrequent && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-medium">
                            <Star className="size-2.5 fill-current" /> VIP
                          </span>
                        )}
                        {hasNoShows && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive font-medium">
                            {c.no_show_count} no-show
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {formatPhone(c.phone_country_code, c.phone)}{c.email ? ` · ${c.email}` : ""}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {c.total_appointments ?? 0} cita(s) · Última visita: {formatLastVisit(c.last_visit_at)}
                      </p>
                    </button>
                    <div className="flex gap-1 shrink-0">
                      {wa && (
                        <Button asChild size="sm" variant="ghost" title="Abrir WhatsApp">
                          <a href={wa} target="_blank" rel="noopener noreferrer">
                            <MessageCircle className="size-3.5" />
                          </a>
                        </Button>
                      )}
                      <ClientDialog initial={c} onSave={(v) => upsert.mutate({ ...v, id: c.id })} trigger={<Button size="sm" variant="ghost" title="Editar"><Pencil className="size-3.5" /></Button>} />
                      <Button size="sm" variant="ghost" title="Eliminar" onClick={() => { if (confirm("¿Eliminar cliente?")) del.mutate(c.id); }}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      {business?.id && (
        <ClientDetailDialog
          businessId={business.id}
          client={detailClient}
          onClose={() => setDetailClient(null)}
        />
      )}
    </div>
  );
}

function StatCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone?: "primary" | "success" | "warning" }) {
  const toneCls =
    tone === "primary" ? "text-primary bg-primary/10"
    : tone === "success" ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
    : tone === "warning" ? "text-amber-600 dark:text-amber-400 bg-amber-500/10"
    : "text-muted-foreground bg-muted";
  return (
    <Card>
      <CardContent className="py-4 px-4 flex items-center gap-3">
        <div className={cn("size-9 rounded-lg flex items-center justify-center shrink-0", toneCls)}>{icon}</div>
        <div className="min-w-0">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{label}</p>
          <p className="font-display text-xl tabular-nums leading-tight">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ClientDetailDialog({ businessId, client, onClose }: { businessId: string; client: any | null; onClose: () => void }) {
  const open = !!client;
  const { data: appts } = useQuery({
    queryKey: ["client-appts", businessId, client?.id],
    enabled: open && !!client?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("id, starts_at, status, price_cents, services(name, price_cents)")
        .eq("business_id", businessId)
        .eq("client_id", client!.id)
        .order("starts_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  const totalSpent = useMemo(() => {
    return (appts ?? [])
      .filter((a: any) => a.status === "completed")
      .reduce((sum: number, a: any) => sum + apptPriceCents(a), 0);
  }, [appts]);

  if (!client) return null;
  const wa = waLink(client.phone_country_code, client.phone);

  const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
    pending: { label: "Pendiente", cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
    booked: { label: "Confirmada", cls: "bg-primary/10 text-primary" },
    completed: { label: "Completada", cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
    cancelled: { label: "Cancelada", cls: "bg-muted text-muted-foreground" },
    no_show: { label: "No-show", cls: "bg-destructive/10 text-destructive" },
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span className="size-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 text-primary font-semibold flex items-center justify-center text-sm">
              {initials(client.name)}
            </span>
            <span className="min-w-0 truncate">{client.name}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground min-w-0">
              <MessageCircle className="size-3.5 shrink-0" />
              <span className="truncate">{formatPhone(client.phone_country_code, client.phone)}</span>
            </div>
            {client.email && (
              <div className="flex items-center gap-2 text-muted-foreground min-w-0">
                <Mail className="size-3.5 shrink-0" />
                <span className="truncate">{client.email}</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-md border border-border p-2">
              <p className="font-display text-lg tabular-nums">{client.total_appointments ?? 0}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Citas</p>
            </div>
            <div className="rounded-md border border-border p-2">
              <p className="font-display text-lg tabular-nums">{formatPriceCents(totalSpent)}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Gastado</p>
            </div>
            <div className="rounded-md border border-border p-2">
              <p className="font-display text-lg tabular-nums">{client.no_show_count ?? 0}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">No-shows</p>
            </div>
          </div>

          {client.notes && (
            <div className="rounded-md bg-muted/40 p-3 text-sm">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Notas</p>
              <p className="whitespace-pre-wrap">{client.notes}</p>
            </div>
          )}

          <div>
            <div className="flex items-center gap-2 mb-2">
              <CalendarClock className="size-4 text-muted-foreground" />
              <p className="text-sm font-medium">Historial reciente</p>
            </div>
            {(appts?.length ?? 0) === 0 ? (
              <p className="text-xs text-muted-foreground">Sin citas registradas.</p>
            ) : (
              <ul className="space-y-1.5 max-h-[200px] overflow-y-auto pr-1">
                {appts!.map((a: any) => {
                  const st = STATUS_LABEL[a.status] ?? STATUS_LABEL.booked;
                  const d = new Date(a.starts_at);
                  return (
                    <li key={a.id} className="flex items-center justify-between gap-2 text-xs py-1.5 border-b border-border/50 last:border-0">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{a.services?.name ?? "Servicio"}</p>
                        <p className="text-muted-foreground tabular-nums">
                          {d.toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" })} · {formatTime(a.starts_at)}
                        </p>
                      </div>
                      <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0", st.cls)}>{st.label}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
        <DialogFooter className="gap-2">
          {wa && (
            <Button asChild variant="outline">
              <a href={wa} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="size-4" /> WhatsApp
              </a>
            </Button>
          )}
          <Button onClick={onClose}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ClientDialog({ initial, onSave, trigger }: { initial?: any; onSave: (c: any) => void; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initial?.name ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [countryCode, setCountryCode] = useState(initial?.phone_country_code ?? DEFAULT_COUNTRY_CODE);
  const [email, setEmail] = useState(initial?.email ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  return (
    <Dialog open={open} onOpenChange={(v) => {
      setOpen(v);
      if (v && initial) {
        setName(initial.name);
        setPhone(initial.phone);
        setCountryCode(initial.phone_country_code ?? DEFAULT_COUNTRY_CODE);
        setEmail(initial.email ?? "");
        setNotes(initial.notes ?? "");
      }
      if (v && !initial) { setName(""); setPhone(""); setCountryCode(DEFAULT_COUNTRY_CODE); setEmail(""); setNotes(""); }
    }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{initial ? "Editar cliente" : "Nuevo cliente"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Nombre</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div>
            <Label>WhatsApp</Label>
            <div className="mt-1.5">
              <PhoneInput
                countryCode={countryCode}
                number={phone}
                onCountryCodeChange={setCountryCode}
                onNumberChange={setPhone}
              />
            </div>
          </div>
          <div><Label>Email (opcional)</Label><Input value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div><Label>Notas</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button onClick={() => { onSave({ name, phone, phone_country_code: countryCode, email, notes }); setOpen(false); }} disabled={!name || !phone}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}