import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
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
import { ChevronLeft, ChevronRight, Plus, CalendarIcon, Link2, Building2, Users, Clock, Search } from "lucide-react";
import { DAY_NAMES_SHORT, formatTime, formatPriceCents } from "@/lib/format";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PhoneInput } from "@/components/PhoneInput";
import { DEFAULT_COUNTRY_CODE } from "@/lib/countries";
import { invalidateAppointments } from "@/lib/query-keys";

type ApptStatus = "pending" | "booked" | "completed" | "cancelled" | "no_show";
type ViewMode = "day" | "week";

type RescheduleInput = { id: string; newDate: Date; newTime: string; durationMin: number };

export const Route = createFileRoute("/dashboard/agenda")({
  component: AgendaPage,
});

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function timeFromOffset(offsetY: number, startHour: number, pxPerMinute: number, endHour: number) {
  const rawMin = Math.max(0, offsetY / pxPerMinute);
  const snapped = Math.round(rawMin / 15) * 15;
  const minute = Math.min((endHour - startHour) * 60 - 15, snapped);
  const total = startHour * 60 + minute;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function computeDayRange(appts: any[]): { startHour: number; endHour: number } {
  let minH = 7;
  let maxH = 22;
  for (const a of appts) {
    const s = new Date(a.starts_at);
    const dur = a.services?.duration_minutes ?? 30;
    const e = new Date(s.getTime() + dur * 60000);
    minH = Math.min(minH, s.getHours());
    const endHourCeil = e.getHours() + (e.getMinutes() > 0 ? 1 : 0);
    maxH = Math.max(maxH, endHourCeil);
  }
  return { startHour: Math.max(0, minH), endHour: Math.min(24, Math.max(maxH, minH + 1)) };
}
function startOfWeek(d: Date) {
  const x = startOfDay(d);
  const day = x.getDay(); // 0 = domingo
  x.setDate(x.getDate() - day);
  return x;
}
function endOfWeek(d: Date) {
  const x = startOfWeek(d);
  x.setDate(x.getDate() + 6);
  x.setHours(23, 59, 59, 999);
  return x;
}
function addWeeks(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n * 7);
  return x;
}
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
  const [date, setDate] = useState(startOfWeek(startOfDay(new Date())));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [view, setView] = useState<ViewMode>("week");
  const [newApptOpen, setNewApptOpen] = useState(false);
  const [newApptSlot, setNewApptSlot] = useState<{ date: Date; time: string }>({ date: new Date(), time: "10:00" });
  const [proFilter, setProFilter] = useState<string>("all");

  function openNewAppt(slotDate: Date, time = "10:00") {
    setNewApptSlot({ date: slotDate, time });
    setNewApptOpen(true);
  }

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

  const { data: prosList } = useQuery({
    queryKey: ["pros-list-agenda", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("professionals")
        .select("id,name")
        .eq("business_id", businessId!)
        .is("deleted_at", null)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
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
  const hasLocations = (locations?.count ?? 0) > 0;
  const canShare = hasPros && hasServices && hasLocations;
  const missing: string[] = [];
  if (!hasLocations) missing.push("una sucursal");
  if (!hasPros) missing.push("un profesional");
  if (!hasServices) missing.push("un servicio");
  const missingMsg = `Agrega ${missing.join(", ")} para activar el link de reservas.`;

  const weekStart = startOfWeek(date);
  const weekEnd = endOfWeek(date);

  const { data: appts, error: apptsError } = useQuery({
    queryKey: ["appts", businessId, view, view === "day" ? date.toDateString() : weekStart.toDateString()],
    enabled: !!businessId,
    queryFn: async () => {
      let query = supabase
        .from("appointments")
        .select("*, clients(name, phone), services(name, duration_minutes, price_cents)")
        .eq("business_id", businessId!)
        .order("starts_at");

      if (view === "day") {
        const end = addDays(date, 1);
        query = query.gte("starts_at", date.toISOString()).lt("starts_at", end.toISOString());
      } else {
        const nextDay = addDays(weekEnd, 1);
        query = query.gte("starts_at", weekStart.toISOString()).lt("starts_at", nextDay.toISOString());
      }

      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  const filteredAppts = (appts ?? []).filter((a) =>
    proFilter === "all" ? true : a.professional_id === proFilter,
  );

  // Próxima cita activa de hoy (para destacar en el header)
  const nowTs = Date.now();
  const nextAppt = filteredAppts
    .filter((a) => (a.status === "booked" || a.status === "pending") && new Date(a.starts_at).getTime() >= nowTs)
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())[0];

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: any }) => {
      const patch: any = { status };
      if (status === "cancelled") patch.cancelled_at = new Date().toISOString();
      const { error } = await supabase.from("appointments").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAppointments(qc);
      toast.success("Actualizado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reschedule = useMutation({
    mutationFn: async ({ id, newDate, newTime, durationMin }: RescheduleInput) => {
      const [h, m] = newTime.split(":").map(Number);
      const start = new Date(newDate);
      start.setHours(h, m, 0, 0);
      const end = new Date(start.getTime() + durationMin * 60_000);
      const { error } = await supabase
        .from("appointments")
        .update({ starts_at: start.toISOString(), ends_at: end.toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onMutate: async (vars) => {
      const keys = qc.getQueryCache().findAll({ queryKey: ["appts"] });
      const snapshots = keys.map((k) => ({ key: k.queryKey, data: qc.getQueryData(k.queryKey) }));
      for (const s of snapshots) {
        const prev = s.data as any[] | undefined;
        if (!Array.isArray(prev)) continue;
        const [h, m] = vars.newTime.split(":").map(Number);
        const start = new Date(vars.newDate);
        start.setHours(h, m, 0, 0);
        const end = new Date(start.getTime() + vars.durationMin * 60_000);
        qc.setQueryData(
          s.key,
          prev.map((a) =>
            a.id === vars.id ? { ...a, starts_at: start.toISOString(), ends_at: end.toISOString() } : a,
          ),
        );
      }
      return { snapshots };
    },
    onError: (e: Error, _vars, ctx) => {
      ctx?.snapshots.forEach((s: any) => qc.setQueryData(s.key, s.data));
      toast.error(e.message || "No se pudo mover la cita");
    },
    onSuccess: () => {
      toast.success("Cita reprogramada");
    },
    onSettled: () => {
      invalidateAppointments(qc);
    },
  });

  if (!business) return <p className="text-muted-foreground">Primero crea tu salón.</p>;

  const isToday = date.toDateString() === new Date().toDateString();
  const bookingUrl = typeof window !== "undefined" ? `${window.location.origin}/b/${business.slug}` : `/b/${business.slug}`;

  const goPrev = () => {
    if (view === "day") setDate(addDays(date, -1));
    else setDate(addWeeks(date, -1));
  };
  const goNext = () => {
    if (view === "day") setDate(addDays(date, 1));
    else setDate(addWeeks(date, 1));
  };

  const today = startOfDay(new Date());
  const weekLabel = view === "week"
    ? `${weekStart.toLocaleDateString("es-PE", { day: "numeric", month: "short" })} – ${weekEnd.toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" })}`
    : `${DAY_NAMES_SHORT[date.getDay()]} ${date.toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" })}`;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-2 flex-wrap">
        <div>
          <h1 className="font-display text-3xl mb-1">Agenda</h1>
          <p className="text-muted-foreground">Citas de la semana.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {prosList && prosList.length > 1 && (
            <Select value={proFilter} onValueChange={setProFilter}>
              <SelectTrigger className="w-[180px] h-9">
                <Users className="size-4 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los profesionales</SelectItem>
                {prosList.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className="inline-flex rounded-md border border-border bg-background p-0.5">
            <button
              type="button"
              onClick={() => setView("day")}
              className={cn("px-3 py-1.5 text-sm rounded-sm transition", view === "day" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              Día
            </button>
            <button
              type="button"
              onClick={() => setView("week")}
              className={cn("px-3 py-1.5 text-sm rounded-sm transition", view === "week" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              Semana
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
          <Button onClick={() => openNewAppt(view === "week" ? new Date() : date)}>
            <Plus className="size-4" /> Nueva cita
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <Button variant="outline" size="sm" onClick={goPrev}><ChevronLeft className="size-4" /></Button>
        <div className="flex items-center gap-2 flex-wrap justify-center">
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <Button variant="ghost" className="font-display text-lg sm:text-xl gap-2">
                <CalendarIcon className="size-4" />
                {weekLabel}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="center">
              <Calendar
                mode="single"
                selected={date}
                onSelect={(d) => { if (d) { setDate(view === "week" ? startOfWeek(d) : startOfDay(d)); setPickerOpen(false); } }}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
          {!isToday && (
            <Button variant="ghost" size="sm" onClick={() => setDate(view === "week" ? startOfWeek(today) : today)}>Hoy</Button>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={goNext}><ChevronRight className="size-4" /></Button>
      </div>

      {nextAppt && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex items-center gap-3 py-3 px-4 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary uppercase tracking-wider">
              <Clock className="size-3.5" /> Próxima cita
            </span>
            <span className="font-display text-base tabular-nums">{formatTime(nextAppt.starts_at)}</span>
            <span className="text-sm text-foreground truncate min-w-0">
              {nextAppt.clients?.name ?? "Sin cliente"} · <span className="text-muted-foreground">{nextAppt.services?.name}</span>
            </span>
            {(() => {
              const proName = prosList?.find((p) => p.id === nextAppt.professional_id)?.name;
              return proName ? (
                <span className="text-xs text-muted-foreground ml-auto">con {proName}</span>
              ) : null;
            })()}
          </CardContent>
        </Card>
      )}

      {apptsError ? (
        <Card><CardContent className="pt-6 text-center text-destructive text-sm">Error al cargar las citas: {(apptsError as Error).message}</CardContent></Card>
      ) : view === "week" ? (
        <WeekCalendar
          weekStart={weekStart}
          appts={filteredAppts}
          onChangeStatus={(id, status) => updateStatus.mutate({ id, status })}
          onSlotClick={(slotDate, time) => openNewAppt(slotDate, time)}
          onReschedule={(v) => reschedule.mutate(v)}
        />
      ) : (
        <DayCalendar
          date={date}
          appts={filteredAppts}
          onChangeStatus={(id, status) => updateStatus.mutate({ id, status })}
          onSlotClick={(time) => openNewAppt(date, time)}
          onReschedule={(v) => reschedule.mutate(v)}
        />
      )}
      {businessId && (
        <NewApptDialog
          businessId={businessId}
          open={newApptOpen}
          onOpenChange={setNewApptOpen}
          initialDate={newApptSlot.date}
          initialTime={newApptSlot.time}
          initialProfessionalId={proFilter !== "all" ? proFilter : undefined}
        />
      )}
    </div>
  );
}

/* ─────────────── Week Calendar ─────────────── */
function WeekCalendar({
  weekStart,
  appts,
  onChangeStatus,
  onSlotClick,
  onReschedule,
}: {
  weekStart: Date;
  appts: any[];
  onChangeStatus: (id: string, status: ApptStatus) => void;
  onSlotClick?: (date: Date, time: string) => void;
  onReschedule?: (v: RescheduleInput) => void;
}) {
  const { startHour, endHour } = computeDayRange(appts);
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);
  const pxPerMinute = 1.2;
  // Forzar re-render cada minuto para que la línea de "ahora" avance.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const scrollRef = useRef<HTMLDivElement>(null);
  const now = new Date();

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const active = appts.filter((a) => a.status !== "cancelled" && a.status !== "no_show");
  const totalRevenueCents = active
    .filter((a) => a.status === "completed")
    .reduce((sum, a) => sum + (a.services?.price_cents ?? 0), 0);
  const totalMinutes = active.reduce((sum, a) => sum + (a.services?.duration_minutes ?? 0), 0);

  useEffect(() => {
    if (scrollRef.current) {
      const nowMinutes = (now.getHours() - startHour) * 60 + now.getMinutes();
      const target = Math.max(0, nowMinutes * pxPerMinute - scrollRef.current.clientHeight / 3);
      scrollRef.current.scrollTo({ top: target, behavior: "smooth" });
    }
  }, [weekStart]);

  const STATUS_DOT: Record<string, string> = {
    pending: "bg-amber-500",
    booked: "bg-primary",
    completed: "bg-emerald-500",
    cancelled: "bg-muted-foreground/40",
    no_show: "bg-destructive",
  };

  return (
    <Card className="overflow-hidden">
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
        <div ref={scrollRef} className="relative flex max-h-[70vh] overflow-y-auto overflow-x-auto">
          {/* Time gutter */}
          <div className="w-14 sm:w-16 shrink-0 sticky left-0 bg-card z-10 border-r border-border">
            <div className="h-12 border-b border-border bg-muted/20" /> {/* header spacer */}
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

          {/* Day columns */}
          {days.map((day, idx) => {
            const isToday = day.toDateString() === now.toDateString();
            const dayAppts = appts.filter((a) => {
              const s = new Date(a.starts_at);
              return s.toDateString() === day.toDateString();
            });
            const nowMinutes = isToday ? (now.getHours() - startHour) * 60 + now.getMinutes() : -1;
            const nowVisible = isToday && nowMinutes >= 0 && nowMinutes <= (endHour - startHour) * 60;

            return (
              <div key={idx} className="relative flex-1 min-w-[140px] border-r border-border last:border-r-0">
                {/* Day header */}
                <div className={cn("h-12 border-b border-border flex flex-col items-center justify-center text-xs", isToday ? "bg-primary/5" : "bg-muted/20")}>
                  <span className={cn("font-medium", isToday ? "text-primary" : "text-muted-foreground")}>{DAY_NAMES_SHORT[day.getDay()]}</span>
                  <span className={cn("tabular-nums", isToday ? "text-primary font-semibold" : "text-foreground")}>{day.getDate()}</span>
                </div>

                {/* Grid */}
                <div
                  className={cn("relative", onSlotClick && "cursor-cell")}
                  onClick={(e) => {
                    if (!onSlotClick) return;
                    if ((e.target as HTMLElement).closest("[data-appt]")) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const time = timeFromOffset(e.clientY - rect.top, startHour, pxPerMinute, endHour);
                    onSlotClick(day, time);
                  }}
                  onDragOver={(e) => {
                    if (!onReschedule) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(e) => {
                    if (!onReschedule) return;
                    e.preventDefault();
                    const id = e.dataTransfer.getData("text/appt-id");
                    const durationMin = Number(e.dataTransfer.getData("text/appt-duration")) || 30;
                    if (!id) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const time = timeFromOffset(e.clientY - rect.top, startHour, pxPerMinute, endHour);
                    onReschedule({ id, newDate: day, newTime: time, durationMin });
                  }}
                >
                  {hours.map((h) => (
                    <div
                      key={h}
                      style={{ height: 60 * pxPerMinute }}
                      className="border-b border-border/70 relative"
                    >
                      <div className="absolute left-0 right-0 top-1/2 border-t border-dashed border-border/40" />
                    </div>
                  ))}

                  {nowVisible && (
                    <div
                      className="absolute left-0 right-0 flex items-center pointer-events-none z-20"
                      style={{ top: nowMinutes * pxPerMinute }}
                    >
                      <div className="h-px flex-1 bg-destructive" />
                      <div className="size-2 rounded-full bg-destructive -mr-1 ring-2 ring-background" />
                    </div>
                  )}

                  {dayAppts.map((a: any) => {
                    const start = new Date(a.starts_at);
                    const startMin = (start.getHours() - startHour) * 60 + start.getMinutes();
                    const dur = a.services?.duration_minutes ?? 30;
                    if (startMin + dur < 0 || startMin > (endHour - startHour) * 60) return null;
                    const top = Math.max(0, startMin) * pxPerMinute;
                    const height = Math.max(28, dur * pxPerMinute - 3);
                    const colorMap: Record<string, { bg: string; border: string; text: string; bar: string }> = {
                      pending: { bg: "bg-amber-50", border: "border-amber-300/70", text: "text-amber-950", bar: "bg-amber-500" },
                      booked: { bg: "bg-primary/10", border: "border-primary/40", text: "text-foreground", bar: "bg-primary" },
                      completed: { bg: "bg-emerald-50", border: "border-emerald-300/70", text: "text-emerald-950", bar: "bg-emerald-500" },
                      cancelled: { bg: "bg-muted/60", border: "border-border", text: "text-muted-foreground line-through", bar: "bg-muted-foreground/30" },
                      no_show: { bg: "bg-destructive/10", border: "border-destructive/40", text: "text-destructive", bar: "bg-destructive" },
                    };
                    const c = colorMap[a.status] ?? colorMap.booked;
                    const compact = height < 40;
                    return (
                      <Popover key={a.id}>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            data-appt="1"
                            draggable={!!onReschedule && a.status !== "cancelled"}
                            onDragStart={(e) => {
                              e.dataTransfer.effectAllowed = "move";
                              e.dataTransfer.setData("text/appt-id", a.id);
                              e.dataTransfer.setData("text/appt-duration", String(dur));
                            }}
                            className={cn(
                              "group absolute left-1 right-1 rounded-md border pl-2 pr-1.5 py-0.5 text-left overflow-hidden",
                              "hover:shadow-md hover:-translate-y-px transition-all duration-150",
                              "focus:outline-none focus:ring-2 focus:ring-primary/40",
                              onReschedule && "cursor-grab active:cursor-grabbing",
                              c.bg, c.border, c.text
                            )}
                            style={{ top, height }}
                          >
                            <span className={cn("absolute left-0 top-0.5 bottom-0.5 w-1 rounded-full", c.bar)} />
                            <div className="flex items-baseline gap-1 leading-tight">
                              <span className="font-display text-[11px] tabular-nums">{formatTime(a.starts_at)}</span>
                              {!compact && <span className="text-[9px] opacity-60 tabular-nums">· {dur}m</span>}
                            </div>
                            <div className="text-[10px] font-medium truncate leading-tight">{a.clients?.name ?? "Sin cliente"}</div>
                            {!compact && (
                              <div className="text-[9px] truncate opacity-75 leading-tight">{a.services?.name}</div>
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
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

/* ─────────────── Day Calendar ─────────────── */
function DayCalendar({
  date,
  appts,
  onChangeStatus,
  onSlotClick,
  onReschedule,
}: {
  date: Date;
  appts: any[];
  onChangeStatus: (id: string, status: ApptStatus) => void;
  onSlotClick?: (time: string) => void;
  onReschedule?: (v: RescheduleInput) => void;
}) {
  const { startHour, endHour } = computeDayRange(appts);
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);
  const pxPerMinute = 1.2;
  // Forzar re-render cada minuto para que la línea de "ahora" avance.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);
  const scrollRef = useRef<HTMLDivElement>(null);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const nowMinutes = (now.getHours() - startHour) * 60 + now.getMinutes();
  const nowVisible = isToday && nowMinutes >= 0 && nowMinutes <= (endHour - startHour) * 60;

  useEffect(() => {
    if (isToday && scrollRef.current) {
      const target = Math.max(0, nowMinutes * pxPerMinute - scrollRef.current.clientHeight / 3);
      scrollRef.current.scrollTo({ top: target, behavior: "smooth" });
    }
  }, [isToday]);

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
        <div ref={scrollRef} className="relative flex max-h-[70vh] overflow-y-auto">
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
          <div
            className={cn("relative flex-1 min-w-0", onSlotClick && "cursor-cell")}
            onClick={(e) => {
              if (!onSlotClick) return;
              if ((e.target as HTMLElement).closest("[data-appt]")) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const time = timeFromOffset(e.clientY - rect.top, startHour, pxPerMinute, endHour);
              onSlotClick(time);
            }}
            onDragOver={(e) => {
              if (!onReschedule) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
            }}
            onDrop={(e) => {
              if (!onReschedule) return;
              e.preventDefault();
              const id = e.dataTransfer.getData("text/appt-id");
              const durationMin = Number(e.dataTransfer.getData("text/appt-duration")) || 30;
              if (!id) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const time = timeFromOffset(e.clientY - rect.top, startHour, pxPerMinute, endHour);
              onReschedule({ id, newDate: date, newTime: time, durationMin });
            }}
          >
            {hours.map((h) => (
              <div
                key={h}
                style={{ height: 60 * pxPerMinute }}
                className="border-b border-border/70 relative"
              >
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
                pending: { bg: "bg-amber-50", border: "border-amber-300/70", text: "text-amber-950", bar: "bg-amber-500" },
                booked: { bg: "bg-primary/10", border: "border-primary/40", text: "text-foreground", bar: "bg-primary" },
                completed: { bg: "bg-emerald-50", border: "border-emerald-300/70", text: "text-emerald-950", bar: "bg-emerald-500" },
                cancelled: { bg: "bg-muted/60", border: "border-border", text: "text-muted-foreground line-through", bar: "bg-muted-foreground/30" },
                no_show: { bg: "bg-destructive/10", border: "border-destructive/40", text: "text-destructive", bar: "bg-destructive" },
              };
              const c = colorMap[a.status] ?? colorMap.booked;
              const compact = height < 48;
              return (
                <Popover key={a.id}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      data-appt="1"
                      draggable={!!onReschedule && a.status !== "cancelled"}
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/appt-id", a.id);
                        e.dataTransfer.setData("text/appt-duration", String(dur));
                      }}
                      className={cn(
                        "group absolute left-1.5 right-1.5 rounded-lg border pl-2.5 pr-2 py-1 text-left overflow-hidden",
                        "hover:shadow-md hover:-translate-y-px transition-all duration-150",
                        "focus:outline-none focus:ring-2 focus:ring-primary/40",
                        onReschedule && "cursor-grab active:cursor-grabbing",
                        c.bg, c.border, c.text
                      )}
                      style={{ top, height }}
                    >
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

function NewApptDialog({
  businessId,
  initialDate,
  initialTime = "10:00",
  trigger,
  open: openProp,
  onOpenChange,
  initialProfessionalId,
}: {
  businessId: string;
  initialDate: Date;
  initialTime?: string;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
  initialProfessionalId?: string;
}) {
  const qc = useQueryClient();
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? !!openProp : internalOpen;
  const setOpen = (v: boolean) => {
    if (!isControlled) setInternalOpen(v);
    onOpenChange?.(v);
  };
  const [serviceId, setServiceId] = useState("");
  const [clientId, setClientId] = useState("");
  const [professionalId, setProfessionalId] = useState<string>(initialProfessionalId ?? "");
  const [locationId, setLocationId] = useState<string>("");
  const [clientSearch, setClientSearch] = useState("");
  const [newClientName, setNewClientName] = useState("");
  const [newClientCountry, setNewClientCountry] = useState(DEFAULT_COUNTRY_CODE);
  const [newClientPhone, setNewClientPhone] = useState("");
  const [creatingClient, setCreatingClient] = useState(false);
  const [dateStr, setDateStr] = useState(toLocalDateInput(initialDate));
  const [time, setTime] = useState(initialTime);

  useEffect(() => {
    if (open) {
      setDateStr(toLocalDateInput(initialDate));
      setTime(initialTime);
      setProfessionalId(initialProfessionalId ?? "");
    }
  }, [open, initialDate, initialTime, initialProfessionalId]);

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
  const { data: pros } = useQuery({
    queryKey: ["pros-active-dialog", businessId],
    enabled: open,
    queryFn: async () => (await supabase.from("professionals").select("id,name").eq("business_id", businessId).is("deleted_at", null).eq("is_active", true).order("name")).data ?? [],
  });
  const { data: locs } = useQuery({
    queryKey: ["locs-active-dialog", businessId],
    enabled: open,
    queryFn: async () => (await supabase.from("locations").select("id,name").eq("business_id", businessId).is("deleted_at", null).eq("is_active", true).order("name")).data ?? [],
  });

  const filteredClients = (clients ?? []).filter((c) => {
    if (!clientSearch.trim()) return true;
    const q = clientSearch.toLowerCase();
    return c.name?.toLowerCase().includes(q) || c.phone?.toLowerCase().includes(q);
  }).slice(0, 50);

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
        professional_id: professionalId || null,
        location_id: locationId || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cita creada");
      invalidateAppointments(qc);
      setOpen(false);
      setServiceId(""); setClientId(""); setNewClientName(""); setNewClientPhone(""); setNewClientCountry(DEFAULT_COUNTRY_CODE); setCreatingClient(false); setClientSearch(""); setLocationId("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
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
          {(pros?.length ?? 0) > 0 && (
            <div>
              <Label>Profesional</Label>
              <Select value={professionalId} onValueChange={setProfessionalId}>
                <SelectTrigger><SelectValue placeholder="Sin asignar" /></SelectTrigger>
                <SelectContent>
                  {pros?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {(locs?.length ?? 0) > 1 && (
            <div>
              <Label>Sucursal</Label>
              <Select value={locationId} onValueChange={setLocationId}>
                <SelectTrigger><SelectValue placeholder="Elegir sucursal" /></SelectTrigger>
                <SelectContent>
                  {locs?.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
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
              <div className="space-y-2">
                {(clients?.length ?? 0) > 8 && (
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Buscar por nombre o teléfono"
                      value={clientSearch}
                      onChange={(e) => setClientSearch(e.target.value)}
                      className="pl-7 h-8 text-xs"
                    />
                  </div>
                )}
                <Select value={clientId} onValueChange={setClientId}>
                  <SelectTrigger><SelectValue placeholder="Elegir cliente" /></SelectTrigger>
                  <SelectContent>
                    {filteredClients.length === 0 ? (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">Sin resultados</div>
                    ) : (
                      filteredClients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} · {c.phone}</SelectItem>)
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Fecha</Label><Input type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} /></div>
            <div><Label>Hora</Label><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
          </div>
          {serviceId && (() => {
            const svc = services?.find((s) => s.id === serviceId);
            if (!svc) return null;
            return (
              <p className="text-xs text-muted-foreground">
                Duración: <span className="text-foreground font-medium">{svc.duration_minutes} min</span>
                {svc.price_cents ? <> · Precio: <span className="text-foreground font-medium">{formatPriceCents(svc.price_cents)}</span></> : null}
              </p>
            );
          })()}
        </div>
        <DialogFooter>
          <Button onClick={() => create.mutate()} disabled={create.isPending}>Crear cita</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
