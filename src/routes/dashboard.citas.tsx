import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMyBusiness } from "@/lib/business";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Search, Filter, CalendarDays, Scissors, ChevronLeft, ChevronRight, MapPin, X, List, LayoutGrid, Clock, CheckCircle2, XCircle, AlertCircle, TrendingUp, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { formatTime, formatPriceCents, DAY_NAMES_SHORT } from "@/lib/format";
import { invalidateAppointments } from "@/lib/query-keys";

export const Route = createFileRoute("/dashboard/citas")({
  component: CitasPage,
});

type ApptStatus = "pending" | "booked" | "completed" | "cancelled" | "no_show";

const STATUS_LABEL: Record<ApptStatus, string> = {
  pending: "Pendiente",
  booked: "Confirmada",
  completed: "Completada",
  cancelled: "Cancelada",
  no_show: "No-show",
};

const STATUS_STYLES: Record<ApptStatus, string> = {
  pending: "bg-yellow-50 text-yellow-700 border-yellow-200",
  booked: "bg-primary/10 text-primary border-primary/20",
  completed: "bg-green-50 text-green-700 border-green-200",
  cancelled: "bg-muted/50 text-muted-foreground border-border",
  no_show: "bg-destructive/10 text-destructive border-destructive/20",
};

const STATUS_DOT: Record<ApptStatus, string> = {
  pending: "bg-yellow-500",
  booked: "bg-primary",
  completed: "bg-green-500",
  cancelled: "bg-muted-foreground",
  no_show: "bg-destructive",
};

const KANBAN_COLS: ApptStatus[] = ["pending", "booked", "completed", "cancelled", "no_show"];

type QuickRange = "all" | "today" | "tomorrow" | "week" | "upcoming";

function CitasPage() {
  const { data: business } = useMyBusiness();
  const businessId = business?.id;
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ApptStatus | "all">("all");
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [page, setPage] = useState(0);
  const [selectedAppt, setSelectedAppt] = useState<any>(null);
  const [view, setView] = useState<"list" | "kanban">("list");
  const [quickRange, setQuickRange] = useState<QuickRange>("all");
  const pageSize = 20;
  const trimmedSearch = search.trim();
  // En Kanban y al buscar, traemos un lote grande sin paginar para que la
  // búsqueda y el tablero abarquen todos los registros, no solo la página actual.
  const usePagination = view === "list" && !trimmedSearch;
  const wideLimit = 500;

  const { data: locationsList } = useQuery({
    queryKey: ["citas-locations", businessId],
    enabled: !!businessId,
    queryFn: async () => (await supabase.from("locations").select("id,name").eq("business_id", businessId!).is("deleted_at", null).order("name")).data ?? [],
  });

  const { data: clientsList } = useQuery({
    queryKey: ["citas-clients", businessId],
    enabled: !!businessId && !!selectedAppt,
    queryFn: async () => (await supabase.from("clients").select("id,name,phone").eq("business_id", businessId!).is("deleted_at", null).order("name")).data ?? [],
  });

  const { data: servicesList } = useQuery({
    queryKey: ["citas-services", businessId],
    enabled: !!businessId && !!selectedAppt,
    queryFn: async () => (await supabase.from("services").select("id,name,duration_minutes,price_cents").eq("business_id", businessId!).is("deleted_at", null).order("name")).data ?? [],
  });

  const { data: appointments, isLoading } = useQuery({
    queryKey: ["citas", businessId, statusFilter, locationFilter, dateFrom, dateTo, trimmedSearch, view, page],
    enabled: !!businessId,
    queryFn: async () => {
      let clientIdsForSearch: string[] | null = null;
      if (trimmedSearch) {
        const { data: matched } = await supabase
          .from("clients")
          .select("id")
          .eq("business_id", businessId!)
          .is("deleted_at", null)
          .or(`name.ilike.%${trimmedSearch}%,phone.ilike.%${trimmedSearch}%`)
          .limit(1000);
        clientIdsForSearch = (matched ?? []).map((c) => c.id);
      }
      let q = supabase
        .from("appointments")
        .select("*, clients(name, phone), services(name, duration_minutes, price_cents)", { count: "exact" })
        .eq("business_id", businessId!)
        .order("starts_at", { ascending: false });
      if (usePagination) {
        q = q.range(page * pageSize, (page + 1) * pageSize - 1);
      } else {
        q = q.range(0, wideLimit - 1);
      }

      if (statusFilter !== "all") {
        q = q.eq("status", statusFilter);
      }
      if (locationFilter !== "all") {
        q = q.eq("location_id", locationFilter);
      }
      if (dateFrom) {
        q = q.gte("starts_at", new Date(dateFrom + "T00:00:00").toISOString());
      }
      if (dateTo) {
        q = q.lte("starts_at", new Date(dateTo + "T23:59:59").toISOString());
      }
      if (clientIdsForSearch !== null) {
        if (clientIdsForSearch.length === 0) {
          return { items: [], count: 0 };
        }
        q = q.in("client_id", clientIdsForSearch);
      }

      const { data, error, count } = await q;
      if (error) throw error;
      return { items: data ?? [], count: count ?? 0 };
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ApptStatus }) => {
      const patch: any = { status };
      if (status === "cancelled") patch.cancelled_at = new Date().toISOString();
      const { error } = await supabase.from("appointments").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAppointments(qc);
      toast.success("Estado actualizado");
      setSelectedAppt(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [editClientId, setEditClientId] = useState("");
  const [editServiceId, setEditServiceId] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("");
  const [editStatus, setEditStatus] = useState<ApptStatus>("booked");
  const [editNotes, setEditNotes] = useState("");

  useEffect(() => {
    if (!selectedAppt) return;
    const d = new Date(selectedAppt.starts_at);
    const pad = (n: number) => String(n).padStart(2, "0");
    setEditClientId(selectedAppt.client_id ?? "");
    setEditServiceId(selectedAppt.service_id ?? "");
    setEditDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
    setEditTime(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
    setEditStatus((selectedAppt.status as ApptStatus) ?? "booked");
    setEditNotes(selectedAppt.notes ?? "");
  }, [selectedAppt?.id]);

  const saveAppt = useMutation({
    mutationFn: async () => {
      if (!selectedAppt) throw new Error("Sin cita");
      if (!editClientId || !editServiceId) throw new Error("Cliente y servicio son requeridos");
      const svc = servicesList?.find((s) => s.id === editServiceId);
      if (!svc) throw new Error("Servicio no encontrado");
      const [y, m, d] = editDate.split("-").map(Number);
      const [hh, mm] = editTime.split(":").map(Number);
      const starts = new Date(y, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0, 0, 0);
      const ends = new Date(starts.getTime() + svc.duration_minutes * 60000);
      const patch: any = {
        client_id: editClientId,
        service_id: editServiceId,
        starts_at: starts.toISOString(),
        ends_at: ends.toISOString(),
        status: editStatus,
        notes: editNotes.trim() || null,
      };
      if (editStatus === "cancelled" && !selectedAppt.cancelled_at) {
        patch.cancelled_at = new Date().toISOString();
      }
      const { error } = await supabase.from("appointments").update(patch).eq("id", selectedAppt.id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAppointments(qc);
      toast.success("Cita actualizada");
      setSelectedAppt(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filteredItems = appointments?.items ?? [];
  const totalPages = usePagination ? Math.ceil((appointments?.count ?? 0) / pageSize) : 1;

  const hasFilters = statusFilter !== "all" || locationFilter !== "all" || !!dateFrom || !!dateTo || !!search.trim() || quickRange !== "all";
  function clearFilters() {
    setStatusFilter("all"); setLocationFilter("all"); setDateFrom(""); setDateTo(""); setSearch(""); setQuickRange("all"); setPage(0);
  }

  function applyQuickRange(r: QuickRange) {
    setQuickRange(r);
    setPage(0);
    const pad = (n: number) => String(n).padStart(2, "0");
    const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const today = new Date();
    if (r === "today") { setDateFrom(fmt(today)); setDateTo(fmt(today)); }
    else if (r === "tomorrow") { const t = new Date(today); t.setDate(t.getDate() + 1); setDateFrom(fmt(t)); setDateTo(fmt(t)); }
    else if (r === "week") { const end = new Date(today); end.setDate(end.getDate() + 6); setDateFrom(fmt(today)); setDateTo(fmt(end)); }
    else if (r === "upcoming") { setDateFrom(fmt(today)); setDateTo(""); }
    else { setDateFrom(""); setDateTo(""); }
  }

  // Quick stats for header (based on currently loaded items)
  const todayStr = new Date().toDateString();
  const stats = (() => {
    const items = filteredItems as any[];
    let todayCount = 0, pendingCount = 0, completedRevenue = 0;
    for (const a of items) {
      const d = new Date(a.starts_at);
      if (d.toDateString() === todayStr) todayCount++;
      if (a.status === "pending") pendingCount++;
      if (a.status === "completed") completedRevenue += a.services?.price_cents ?? 0;
    }
    return { todayCount, pendingCount, completedRevenue };
  })();

  function initials(name?: string | null) {
    if (!name) return "?";
    return name.split(" ").filter(Boolean).slice(0, 2).map((n) => n[0]?.toUpperCase()).join("");
  }

  function formatDateLabel(iso: string) {
    const d = new Date(iso);
    return `${DAY_NAMES_SHORT[d.getDay()]} ${d.toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" })}`;
  }

  function dayGroupLabel(iso: string) {
    const d = new Date(iso); d.setHours(0,0,0,0);
    const t = new Date(); t.setHours(0,0,0,0);
    const diff = Math.round((d.getTime() - t.getTime()) / 86400000);
    if (diff === 0) return "Hoy";
    if (diff === 1) return "Mañana";
    if (diff === -1) return "Ayer";
    return d.toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" });
  }

  // Group items by date (only useful in list view)
  const grouped: { key: string; label: string; items: any[] }[] = (() => {
    const map = new Map<string, { label: string; items: any[] }>();
    for (const a of filteredItems as any[]) {
      const d = new Date(a.starts_at);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const entry = map.get(key) ?? { label: dayGroupLabel(a.starts_at), items: [] };
      entry.items.push(a);
      map.set(key, entry);
    }
    return Array.from(map.entries()).map(([key, v]) => ({ key, ...v }));
  })();

  function getLocationName(locationId?: string | null) {
    return locationsList?.find((l) => l.id === locationId)?.name ?? "";
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl mb-1">Citas</h1>
        <p className="text-muted-foreground">Historial y gestión de todas las citas.</p>
      </div>

      {/* Stats summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Card><CardContent className="py-3 px-4">
          <p className="text-xs text-muted-foreground flex items-center gap-1.5"><CalendarDays className="size-3.5" /> Hoy</p>
          <p className="font-display text-2xl">{stats.todayCount}</p>
        </CardContent></Card>
        <Card><CardContent className="py-3 px-4">
          <p className="text-xs text-muted-foreground flex items-center gap-1.5"><AlertCircle className="size-3.5" /> Pendientes</p>
          <p className="font-display text-2xl text-yellow-600">{stats.pendingCount}</p>
        </CardContent></Card>
        <Card><CardContent className="py-3 px-4">
          <p className="text-xs text-muted-foreground flex items-center gap-1.5"><TrendingUp className="size-3.5" /> Completadas (S/)</p>
          <p className="font-display text-2xl text-green-600">{formatPriceCents(stats.completedRevenue)}</p>
        </CardContent></Card>
        <Card><CardContent className="py-3 px-4">
          <p className="text-xs text-muted-foreground flex items-center gap-1.5"><List className="size-3.5" /> En vista</p>
          <p className="font-display text-2xl">{appointments?.count ?? 0}</p>
        </CardContent></Card>
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
      <div className="inline-flex rounded-md border border-border bg-background p-0.5 w-fit">
        <button
          type="button"
          onClick={() => setView("list")}
          className={cn("px-3 py-1.5 text-sm rounded-sm transition inline-flex items-center gap-1.5", view === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
        >
          <List className="size-3.5" /> Lista
        </button>
        <button
          type="button"
          onClick={() => setView("kanban")}
          className={cn("px-3 py-1.5 text-sm rounded-sm transition inline-flex items-center gap-1.5", view === "kanban" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
        >
          <LayoutGrid className="size-3.5" /> Kanban
        </button>
      </div>
        {/* Quick date filters */}
        <div className="inline-flex rounded-md border border-border bg-background p-0.5 flex-wrap">
          {([
            { id: "all", label: "Todas" },
            { id: "today", label: "Hoy" },
            { id: "tomorrow", label: "Mañana" },
            { id: "week", label: "7 días" },
            { id: "upcoming", label: "Próximas" },
          ] as { id: QuickRange; label: string }[]).map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => applyQuickRange(r.id)}
              className={cn("px-2.5 py-1.5 text-xs rounded-sm transition", quickRange === r.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por cliente, servicio o teléfono..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="pl-9"
          />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="size-4 text-muted-foreground" />
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as ApptStatus | "all"); setPage(0); }}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Estado" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="pending">Pendiente</SelectItem>
                <SelectItem value="booked">Confirmada</SelectItem>
                <SelectItem value="completed">Completada</SelectItem>
                <SelectItem value="cancelled">Cancelada</SelectItem>
                <SelectItem value="no_show">No-show</SelectItem>
              </SelectContent>
            </Select>
            {(locationsList?.length ?? 0) > 0 && (
              <Select value={locationFilter} onValueChange={(v) => { setLocationFilter(v); setPage(0); }}>
                <SelectTrigger className="w-44"><SelectValue placeholder="Sucursal" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las sucursales</SelectItem>
                  {locationsList!.map((l) => (
                    <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <CalendarDays className="size-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Desde</span>
            <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(0); }} className="w-40 h-9" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Hasta</span>
            <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(0); }} className="w-40 h-9" />
          </div>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9">
              <X className="size-3.5 mr-1" /> Limpiar
            </Button>
          )}
          <span className="text-xs text-muted-foreground ml-auto">{appointments?.count ?? 0} resultados</span>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}><CardContent className="py-5"><div className="h-5 bg-muted rounded w-3/4 animate-pulse" /></CardContent></Card>
          ))}
        </div>
      ) : !filteredItems.length ? (
        <Card>
          <CardContent className="pt-8 pb-8 text-center text-muted-foreground">
            <CalendarDays className="size-8 mx-auto mb-2 opacity-40" />
            <p>No se encontraron citas.</p>
          </CardContent>
        </Card>
      ) : view === "kanban" ? (
        <KanbanBoard
          appts={filteredItems}
          onChangeStatus={(id, status) => updateStatus.mutate({ id, status })}
          onSelect={(a) => setSelectedAppt(a)}
        />
      ) : (
        <div className="space-y-5">
          {grouped.map((g) => {
            const dayRevenue = g.items.reduce((acc: number, a: any) => acc + (a.status === "completed" ? (a.services?.price_cents ?? 0) : 0), 0);
            return (
              <div key={g.key} className="space-y-2">
                <div className="flex items-center gap-2 sticky top-0 bg-background/95 backdrop-blur z-10 py-1.5">
                  <div className="h-px flex-1 bg-border" />
                  <p className="text-xs uppercase tracking-wider font-medium text-muted-foreground capitalize">{g.label}</p>
                  <span className="text-[11px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{g.items.length}</span>
                  {dayRevenue > 0 && <span className="text-[11px] text-green-600 font-medium">{formatPriceCents(dayRevenue)}</span>}
                  <div className="h-px flex-1 bg-border" />
                </div>
                {g.items.map((a: any) => (
                  <Card
                    key={a.id}
                    className={cn("group hover:shadow-md hover:border-primary/40 transition-all cursor-pointer relative overflow-hidden", a.status === "cancelled" && "opacity-60")}
                    onClick={() => setSelectedAppt(a)}
                  >
                    <div className={cn("absolute left-0 top-0 bottom-0 w-1", STATUS_DOT[a.status as ApptStatus])} />
                    <CardContent className="py-4 px-5 pl-6">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-start gap-4">
                          <div className="text-center min-w-[64px]">
                            <p className="font-display text-xl leading-none">{formatTime(a.starts_at)}</p>
                            <p className="text-[11px] text-muted-foreground mt-1 flex items-center justify-center gap-1"><Clock className="size-3" />{a.services?.duration_minutes}m</p>
                          </div>
                          <div className="size-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 text-primary font-medium flex items-center justify-center text-sm shrink-0">
                            {initials(a.clients?.name)}
                          </div>
                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-medium truncate">{a.clients?.name}</p>
                              {a.clients?.phone && <span className="text-xs text-muted-foreground">{a.clients.phone}</span>}
                            </div>
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Scissors className="size-3.5" />
                              <p className="text-sm truncate">{a.services?.name}</p>
                            </div>
                            {getLocationName(a.location_id) && (
                              <p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="size-3" /> {getLocationName(a.location_id)}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 self-start sm:self-center">
                          {/* Quick actions on hover for pending/booked */}
                          {(a.status === "pending" || a.status === "booked") && (
                            <div className="hidden md:flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                              {a.status === "pending" && (
                                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => updateStatus.mutate({ id: a.id, status: "booked" })}>
                                  <CheckCircle2 className="size-3.5 mr-1" /> Confirmar
                                </Button>
                              )}
                              {a.status === "booked" && (
                                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => updateStatus.mutate({ id: a.id, status: "completed" })}>
                                  <CheckCircle2 className="size-3.5 mr-1" /> Completar
                                </Button>
                              )}
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => updateStatus.mutate({ id: a.id, status: "cancelled" })}>
                                <XCircle className="size-3.5 text-destructive" />
                              </Button>
                            </div>
                          )}
                          <span className={cn("text-xs px-2.5 py-1 rounded-full border font-medium inline-flex items-center gap-1.5", STATUS_STYLES[a.status as ApptStatus])}>
                            <span className={cn("size-1.5 rounded-full", STATUS_DOT[a.status as ApptStatus])} />
                            {STATUS_LABEL[a.status as ApptStatus]}
                          </span>
                          <p className="text-sm font-medium text-right hidden sm:block">{formatPriceCents(a.services?.price_cents ?? 0)}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {usePagination && totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-muted-foreground">
            Mostrando {page * pageSize + 1}-{Math.min((page + 1) * pageSize, appointments?.count ?? 0)} de {appointments?.count}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
              <ChevronLeft className="size-4" />
            </Button>
            <span className="text-sm text-muted-foreground min-w-[3ch] text-center">{page + 1}</span>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      <Dialog open={!!selectedAppt} onOpenChange={(v) => !v && setSelectedAppt(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar cita</DialogTitle>
          </DialogHeader>
          {selectedAppt && (
            <div className="space-y-4">
              {getLocationName(selectedAppt.location_id) && (
                <p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="size-3" /> {getLocationName(selectedAppt.location_id)}</p>
              )}
              <div>
                <Label>Cliente</Label>
                <Select value={editClientId} onValueChange={setEditClientId}>
                  <SelectTrigger><SelectValue placeholder="Elegir cliente" /></SelectTrigger>
                  <SelectContent>
                    {clientsList?.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Servicio</Label>
                <Select value={editServiceId} onValueChange={setEditServiceId}>
                  <SelectTrigger><SelectValue placeholder="Elegir servicio" /></SelectTrigger>
                  <SelectContent>
                    {servicesList?.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name} · {s.duration_minutes}m · {formatPriceCents(s.price_cents)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Fecha</Label>
                  <Input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
                </div>
                <div>
                  <Label>Hora</Label>
                  <Input type="time" value={editTime} onChange={(e) => setEditTime(e.target.value)} />
                </div>
              </div>
              <div>
                <Label>Estado</Label>
                <Select value={editStatus} onValueChange={(v) => setEditStatus(v as ApptStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pendiente</SelectItem>
                    <SelectItem value="booked">Confirmada</SelectItem>
                    <SelectItem value="completed">Completada</SelectItem>
                    <SelectItem value="cancelled">Cancelada</SelectItem>
                    <SelectItem value="no_show">No-show</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Notas</Label>
                <Textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={3} maxLength={1000} placeholder="Notas internas (opcional)" />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setSelectedAppt(null)}>Cancelar</Button>
                <Button onClick={() => saveAppt.mutate()} disabled={saveAppt.isPending}>
                  {saveAppt.isPending ? "Guardando…" : "Guardar cambios"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KanbanBoard({
  appts,
  onChangeStatus,
  onSelect,
}: {
  appts: any[];
  onChangeStatus: (id: string, status: ApptStatus) => void;
  onSelect: (a: any) => void;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const grouped: Record<ApptStatus, any[]> = {
    pending: [], booked: [], completed: [], cancelled: [], no_show: [],
  };
  for (const a of appts) {
    const s = (a.status as ApptStatus) ?? "pending";
    if (grouped[s]) grouped[s].push(a);
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
      {KANBAN_COLS.map((col) => (
        <div
          key={col}
          onDragOver={(e) => { e.preventDefault(); }}
          onDrop={(e) => {
            e.preventDefault();
            const id = e.dataTransfer.getData("text/plain") || draggingId;
            setDraggingId(null);
            if (id) {
              const current = appts.find((a) => a.id === id);
              if (current && current.status !== col) onChangeStatus(id, col);
            }
          }}
          className={cn("border border-border rounded-lg p-3 min-h-[200px] transition-colors", draggingId ? "bg-primary/5" : "bg-muted/30")}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className={cn("size-2 rounded-full", STATUS_DOT[col])} />
              <h3 className="font-medium text-sm">{STATUS_LABEL[col]}</h3>
            </div>
            <span className="text-xs text-muted-foreground bg-background border border-border rounded-full px-2 py-0.5">
              {grouped[col].length}
            </span>
          </div>
          <div className="space-y-2">
            {grouped[col].map((a: any) => (
              <div
                key={a.id}
                draggable
                onDragStart={(e) => {
                  setDraggingId(a.id);
                  e.dataTransfer.setData("text/plain", a.id);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragEnd={() => setDraggingId(null)}
                onClick={() => onSelect(a)}
                className={cn(
                  "bg-card border border-border rounded-md p-3 cursor-grab active:cursor-grabbing hover:border-primary/40 hover:shadow-sm transition relative",
                  draggingId === a.id && "opacity-50"
                )}
              >
                <div className={cn("absolute left-0 top-2 bottom-2 w-0.5 rounded-r", STATUS_DOT[col])} />
                <div className="flex items-center justify-between mb-1">
                  <span className="font-display text-base">{formatTime(a.starts_at)}</span>
                  <span className="text-xs text-muted-foreground">{a.services?.duration_minutes}m</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="size-6 rounded-full bg-primary/10 text-primary text-[10px] font-medium flex items-center justify-center shrink-0">
                    {(a.clients?.name ?? "?").split(" ").slice(0,2).map((n: string) => n[0]?.toUpperCase()).join("")}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate leading-tight">{a.clients?.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{a.services?.name}</p>
                  </div>
                </div>
              </div>
            ))}
            {grouped[col].length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4 border border-dashed border-border rounded">Sin citas</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
