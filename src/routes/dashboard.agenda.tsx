import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMyBusiness } from "@/lib/business";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { ChevronLeft, ChevronRight, Plus, CalendarIcon, Link2, Building2 } from "lucide-react";
import { DAY_NAMES_SHORT, formatTime, formatPriceCents } from "@/lib/format";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PhoneInput } from "@/components/PhoneInput";
import { DEFAULT_COUNTRY_CODE } from "@/lib/countries";

type ApptStatus = "pending" | "booked" | "completed" | "cancelled" | "no_show";
type ViewMode = "calendar" | "kanban";

const STATUS_LABEL: Record<ApptStatus, string> = {
  pending: "Pendiente",
  booked: "Confirmada",
  completed: "Completada",
  cancelled: "Cancelada",
  no_show: "No-show",
};
const KANBAN_COLS: ApptStatus[] = ["pending", "booked", "completed", "cancelled", "no_show"];

export const Route = createFileRoute("/dashboard/agenda")({
  component: AgendaPage,
});

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate()+n); return x; }
function toLocalDateInput(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function fromLocalDateInput(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function AgendaPage() {
  const { data: business } = useMyBusiness();
  const businessId = business?.id;
  const qc = useQueryClient();
  const [date, setDate] = useState(startOfDay(new Date()));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [view, setView] = useState<ViewMode>("calendar");

  const { data: locations } = useQuery({
    queryKey: ["locations-count", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("locations")
        .select("id", { count: "exact", head: true })
        .eq("business_id", businessId!)
        .is("deleted_at", null)
        .eq("is_active", true);
      if (error) throw error;
      return { count: count ?? 0 };
    },
  });

  const { data: prosCount } = useQuery({
    queryKey: ["pros-count", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("professionals")
        .select("id", { count: "exact", head: true })
        .eq("business_id", businessId!)
        .is("deleted_at", null)
        .eq("is_active", true);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const { data: servicesCount } = useQuery({
    queryKey: ["services-count", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("services")
        .select("id", { count: "exact", head: true })
        .eq("business_id", businessId!)
        .is("deleted_at", null)
        .eq("is_active", true);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const hasPros = (prosCount ?? 0) > 0;
  const hasServices = (servicesCount ?? 0) > 0;
  const canShare = hasPros && hasServices;
  const missing: string[] = [];
  if (!hasPros) missing.push("un profesional");
  if (!hasServices) missing.push("un servicio");
  const missingMsg = `Agrega ${missing.join(", ")} para activar el link de reservas.`;

  const { data: appts, error: apptsError } = useQuery({
    queryKey: ["appts", businessId, date.toDateString()],
    enabled: !!businessId,
    queryFn: async () => {
      const end = addDays(date, 1);
      const { data, error } = await supabase
        .from("appointments")
        .select("*, clients(name, phone), services(name, duration_minutes, price_cents)")
        .eq("business_id", businessId!)
        .gte("starts_at", date.toISOString())
        .lt("starts_at", end.toISOString())
        .order("starts_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: any }) => {
      const patch: any = { status };
      if (status === "cancelled") patch.cancelled_at = new Date().toISOString();
      const { error } = await supabase.from("appointments").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["appts"] }); toast.success("Actualizado"); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!business) return <p className="text-muted-foreground">Primero crea tu salón.</p>;

  const isToday = date.toDateString() === new Date().toDateString();
  const bookingUrl = typeof window !== "undefined" ? `${window.location.origin}/b/${business.slug}` : `/b/${business.slug}`;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-2 flex-wrap">
        <div>
          <h1 className="font-display text-3xl mb-1">Agenda</h1>
          <p className="text-muted-foreground">Citas del día.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className="inline-flex rounded-md border border-border bg-background p-0.5">
            <button
              type="button"
              onClick={() => setView("calendar")}
              className={cn("px-3 py-1.5 text-sm rounded-sm transition", view === "calendar" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              Calendario
            </button>
            <button
              type="button"
              onClick={() => setView("kanban")}
              className={cn("px-3 py-1.5 text-sm rounded-sm transition", view === "kanban" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              Kanban
            </button>
          </div>
          {!canShare ? (
            <Button variant="outline" disabled title={missingMsg}>
              <Building2 className="size-4" /> Copiar link de reservas
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(bookingUrl);
                toast.success("Link copiado", { description: bookingUrl });
              }}
            >
              <Link2 className="size-4" /> Copiar link de reservas
            </Button>
          )}
          <NewApptDialog businessId={businessId!} initialDate={date} trigger={<Button><Plus className="size-4" /> Nueva cita</Button>} />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <Button variant="outline" size="sm" onClick={() => setDate(addDays(date, -1))}><ChevronLeft className="size-4" /></Button>
        <div className="flex items-center gap-2 flex-wrap justify-center">
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <Button variant="ghost" className="font-display text-lg sm:text-xl gap-2">
                <CalendarIcon className="size-4" />
                {DAY_NAMES_SHORT[date.getDay()]} {date.toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="center">
              <Calendar
                mode="single"
                selected={date}
                onSelect={(d) => { if (d) { setDate(startOfDay(d)); setPickerOpen(false); } }}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
          {!isToday && <Button variant="ghost" size="sm" onClick={() => setDate(startOfDay(new Date()))}>Hoy</Button>}
        </div>
        <Button variant="outline" size="sm" onClick={() => setDate(addDays(date, 1))}><ChevronRight className="size-4" /></Button>
      </div>

      {apptsError ? (
        <Card><CardContent className="pt-6 text-center text-destructive text-sm">Error al cargar las citas: {(apptsError as Error).message}</CardContent></Card>
      ) : view === "kanban" ? (
        !appts?.length ? (
          <Card><CardContent className="pt-6 text-center text-muted-foreground">No hay citas este día.</CardContent></Card>
        ) : (
          <KanbanBoard appts={appts} onChangeStatus={(id, status) => updateStatus.mutate({ id, status })} />
        )
      ) : (
        <DayCalendar
          date={date}
          appts={appts ?? []}
          onChangeStatus={(id, status) => updateStatus.mutate({ id, status })}
        />
      )}
    </div>
  );
}

function DayCalendar({
  date,
  appts,
  onChangeStatus,
}: {
  date: Date;
  appts: any[];
  onChangeStatus: (id: string, status: ApptStatus) => void;
}) {
  const startHour = 7;
  const endHour = 22;
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);
  const pxPerMinute = 1.2; // 72px per hour
  const isToday = date.toDateString() === new Date().toDateString();
  const now = new Date();
  const nowMinutes = (now.getHours() - startHour) * 60 + now.getMinutes();
  const nowVisible = isToday && nowMinutes >= 0 && nowMinutes <= (endHour - startHour) * 60;

  const active = appts.filter((a) => a.status !== "cancelled" && a.status !== "no_show");
  const totalRevenueCents = active
    .filter((a) => a.status === "completed")
    .reduce((sum, a) => sum + (a.services?.price_cents ?? 0), 0);
  const totalMinutes = active.reduce((sum, a) => sum + (a.services?.duration_minutes ?? 0), 0);

  const STATUS_DOT: Record<string, string> = {
    pending: "bg-amber-500",
    booked: "bg-primary",
    completed: "bg-emerald-500",
    cancelled: "bg-muted-foreground/40",
    no_show: "bg-destructive",
  };

  return (
    <Card className="overflow-hidden">
      {/* Day summary strip */}
      <div className="flex items-center justify-between gap-4 px-4 sm:px-5 py-3 border-b border-border bg-muted/30 text-xs">
        <div className="flex items-center gap-4 flex-wrap">
          <span className="flex items-center gap-1.5">
            <span className="font-display text-base text-foreground tabular-nums">{active.length}</span>
            <span className="text-muted-foreground">{active.length === 1 ? "cita" : "citas"}</span>
          </span>
          {totalMinutes > 0 && (
            <span className="text-muted-foreground">
              <span className="text-foreground font-medium tabular-nums">{Math.floor(totalMinutes / 60)}h {totalMinutes % 60}m</span> reservadas
            </span>
          )}
          {totalRevenueCents > 0 && (
            <span className="text-muted-foreground">
              <span className="text-foreground font-medium tabular-nums">{formatPriceCents(totalRevenueCents)}</span> facturado
            </span>
          )}
        </div>
        <div className="hidden sm:flex items-center gap-3 text-[11px] text-muted-foreground">
          <LegendDot color="bg-amber-500" label="Pendiente" />
          <LegendDot color="bg-primary" label="Confirmada" />
          <LegendDot color="bg-emerald-500" label="Completada" />
        </div>
      </div>
      <CardContent className="p-0">
        {active.length === 0 && !nowVisible && (
          <div className="absolute inset-x-0 z-10 pointer-events-none flex justify-center" style={{ top: 120 }}>
            <div className="pointer-events-auto bg-background/90 backdrop-blur border border-border rounded-full px-4 py-1.5 text-xs text-muted-foreground shadow-sm">
              Sin citas este día. Comparte tu link o crea una nueva.
            </div>
          </div>
        )}
        <div className="relative flex max-h-[70vh] overflow-y-auto">
          {/* Time gutter */}
          <div className="w-14 sm:w-16 shrink-0 sticky left-0 bg-card z-10 border-r border-border">
            {hours.map((h) => (
              <div
                key={h}
                style={{ height: 60 * pxPerMinute }}
                className="relative text-[11px] text-muted-foreground text-right pr-2"
              >
                <span className="absolute -top-2 right-2 bg-card px-1 tabular-nums">
                  {String(h).padStart(2, "0")}:00
                </span>
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div className="relative flex-1 min-w-0">
            {hours.map((h) => (
              <div
                key={h}
                style={{ height: 60 * pxPerMinute }}
                className="border-b border-border/70 relative"
              >
                {/* 30-min line */}
                <div className="absolute left-0 right-0 top-1/2 border-t border-dashed border-border/40" />
              </div>
            ))}

            {nowVisible && (
              <div
                className="absolute left-0 right-0 flex items-center pointer-events-none z-20"
                style={{ top: nowMinutes * pxPerMinute }}
              >
                <div className="ml-1 text-[10px] font-semibold text-destructive bg-background border border-destructive/40 rounded-full px-1.5 py-0.5 tabular-nums shadow-sm">
                  {formatTime(now)}
                </div>
                <div className="h-px flex-1 bg-destructive" />
                <div className="size-2 rounded-full bg-destructive -mr-1 ring-2 ring-background" />
              </div>
            )}

            {appts.map((a: any) => {
              const start = new Date(a.starts_at);
              const startMin = (start.getHours() - startHour) * 60 + start.getMinutes();
              const dur = a.services?.duration_minutes ?? 30;
              if (startMin + dur < 0 || startMin > (endHour - startHour) * 60) return null;
              const top = Math.max(0, startMin) * pxPerMinute;
              const height = Math.max(34, dur * pxPerMinute - 3);
              const colorMap: Record<string, { bg: string; border: string; text: string; bar: string }> = {
                pending:   { bg: "bg-amber-50",     border: "border-amber-300/70",     text: "text-amber-950",     bar: "bg-amber-500" },
                booked:    { bg: "bg-primary/10",   border: "border-primary/40",       text: "text-foreground",    bar: "bg-primary" },
                completed: { bg: "bg-emerald-50",   border: "border-emerald-300/70",   text: "text-emerald-950",   bar: "bg-emerald-500" },
                cancelled: { bg: "bg-muted/60",     border: "border-border",           text: "text-muted-foreground line-through", bar: "bg-muted-foreground/30" },
                no_show:   { bg: "bg-destructive/10", border: "border-destructive/40", text: "text-destructive",   bar: "bg-destructive" },
              };
              const c = colorMap[a.status] ?? colorMap.booked;
              const compact = height < 48;
              return (
                <Popover key={a.id}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        "group absolute left-1.5 right-1.5 rounded-lg border pl-2.5 pr-2 py-1 text-left overflow-hidden",
                        "hover:shadow-md hover:-translate-y-px transition-all duration-150",
                        "focus:outline-none focus:ring-2 focus:ring-primary/40",
                        c.bg, c.border, c.text
                      )}
                      style={{ top, height }}
                    >
                      {/* Left status bar */}
                      <span className={cn("absolute left-0 top-1 bottom-1 w-1 rounded-full", c.bar)} />
                      <div className="flex items-baseline gap-1.5 leading-tight">
                        <span className="font-display text-[13px] tabular-nums">{formatTime(a.starts_at)}</span>
                        <span className="text-[10px] opacity-60 tabular-nums">· {dur}m</span>
                      </div>
                      <div className="text-xs font-medium truncate leading-tight mt-0.5">{a.clients?.name ?? "Sin cliente"}</div>
                      {!compact && (
                        <div className="text-[11px] truncate opacity-75 leading-tight">{a.services?.name}</div>
                      )}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72" align="start">
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium truncate">{a.clients?.name ?? "Sin cliente"}</p>
                          {a.clients?.phone && <p className="text-xs text-muted-foreground truncate">{a.clients.phone}</p>}
                        </div>
                        <span className={cn("size-2 rounded-full mt-1.5 shrink-0", STATUS_DOT[a.status] ?? STATUS_DOT.booked)} />
                      </div>
                      <div className="text-sm space-y-0.5 border-t border-border pt-2">
                        <p className="font-medium">{a.services?.name}</p>
                        <p className="text-xs text-muted-foreground tabular-nums">
                          {formatTime(a.starts_at)} · {a.services?.duration_minutes}m
                          {a.services?.price_cents ? ` · ${formatPriceCents(a.services.price_cents)}` : ""}
                        </p>
                      </div>
                      <Select value={a.status} onValueChange={(v) => onChangeStatus(a.id, v as ApptStatus)}>
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
                  </PopoverContent>
                </Popover>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn("size-1.5 rounded-full", color)} />
      <span>{label}</span>
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    booked: "bg-primary/15 text-primary",
    completed: "bg-green-100 text-green-800",
    cancelled: "bg-muted text-muted-foreground",
    no_show: "bg-destructive/15 text-destructive",
  };
  return <span className={cn("text-xs px-2 py-0.5 rounded-full hidden sm:inline-block", map[status])}>{status}</span>;
}

function KanbanBoard({ appts, onChangeStatus }: { appts: any[]; onChangeStatus: (id: string, status: ApptStatus) => void }) {
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
          className="bg-muted/30 border border-border rounded-lg p-3 min-h-[200px]"
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium text-sm">{STATUS_LABEL[col]}</h3>
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
                className={cn(
                  "bg-card border border-border rounded-md p-3 cursor-grab active:cursor-grabbing hover:border-primary/40 transition",
                  draggingId === a.id && "opacity-50"
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-display text-base">{formatTime(a.starts_at)}</span>
                  <span className="text-xs text-muted-foreground">{a.services?.duration_minutes}m</span>
                </div>
                <p className="text-sm font-medium truncate">{a.clients?.name}</p>
                <p className="text-xs text-muted-foreground truncate">{a.services?.name}</p>
              </div>
            ))}
            {grouped[col].length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">Sin citas</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function NewApptDialog({ businessId, initialDate, trigger }: { businessId: string; initialDate: Date; trigger: React.ReactNode }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [serviceId, setServiceId] = useState("");
  const [clientId, setClientId] = useState("");
  const [newClientName, setNewClientName] = useState("");
  const [newClientCountry, setNewClientCountry] = useState(DEFAULT_COUNTRY_CODE);
  const [newClientPhone, setNewClientPhone] = useState("");
  const [creatingClient, setCreatingClient] = useState(false);
  const [dateStr, setDateStr] = useState(toLocalDateInput(initialDate));
  const [time, setTime] = useState("10:00");

  useEffect(() => { if (open) setDateStr(toLocalDateInput(initialDate)); }, [open, initialDate]);

  const { data: services } = useQuery({
    queryKey: ["services-active", businessId],
    enabled: open,
    queryFn: async () => (await supabase.from("services").select("*").eq("business_id", businessId).is("deleted_at", null).eq("is_active", true).order("name")).data ?? [],
  });
  const { data: clients } = useQuery({
    queryKey: ["clients-min", businessId],
    enabled: open,
    queryFn: async () => (await supabase.from("clients").select("id,name,phone").eq("business_id", businessId).is("deleted_at", null).order("name")).data ?? [],
  });

  const create = useMutation({
    mutationFn: async () => {
      let cid = clientId;
      if (creatingClient) {
        if (!newClientName || !newClientPhone) throw new Error("Faltan datos del cliente");
        const { data, error } = await supabase
          .from("clients")
          .insert({
            business_id: businessId,
            name: newClientName,
            phone: newClientPhone,
            phone_country_code: newClientCountry,
          })
          .select()
          .single();
        if (error) throw error;
        cid = data.id;
      }
      const svc = services?.find((s) => s.id === serviceId);
      if (!svc || !cid) throw new Error("Falta servicio o cliente");
      const [h, m] = time.split(":").map(Number);
      const starts = fromLocalDateInput(dateStr);
      starts.setHours(h, m, 0, 0);
      const ends = new Date(starts.getTime() + svc.duration_minutes * 60000);
      const { error } = await supabase.from("appointments").insert({
        business_id: businessId, client_id: cid, service_id: serviceId,
        starts_at: starts.toISOString(), ends_at: ends.toISOString(),
        source: "manual", status: "booked",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cita creada");
      qc.invalidateQueries({ queryKey: ["appts"] });
      qc.invalidateQueries({ queryKey: ["today-appts"] });
      setOpen(false);
      setServiceId(""); setClientId(""); setNewClientName(""); setNewClientPhone(""); setNewClientCountry(DEFAULT_COUNTRY_CODE); setCreatingClient(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Nueva cita</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Servicio</Label>
            <Select value={serviceId} onValueChange={setServiceId}>
              <SelectTrigger><SelectValue placeholder="Elegir servicio" /></SelectTrigger>
              <SelectContent>
                {services?.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} · {s.duration_minutes}m</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <Label>Cliente</Label>
              <button type="button" className="text-xs text-primary underline" onClick={() => setCreatingClient(!creatingClient)}>
                {creatingClient ? "Elegir existente" : "+ Nuevo cliente"}
              </button>
            </div>
            {creatingClient ? (
              <div className="space-y-2">
                <Input placeholder="Nombre" value={newClientName} onChange={(e) => setNewClientName(e.target.value)} />
                <PhoneInput
                  countryCode={newClientCountry}
                  number={newClientPhone}
                  onCountryCodeChange={setNewClientCountry}
                  onNumberChange={setNewClientPhone}
                />
              </div>
            ) : (
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger><SelectValue placeholder="Elegir cliente" /></SelectTrigger>
                <SelectContent>
                  {clients?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} · {c.phone}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Fecha</Label><Input type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} /></div>
            <div><Label>Hora</Label><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => create.mutate()} disabled={create.isPending}>Crear cita</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}