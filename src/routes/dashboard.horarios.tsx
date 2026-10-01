import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMyBusiness } from "@/lib/business";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { DAY_NAMES } from "@/lib/format";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { Clock, Copy, CalendarCheck2, Sun, Moon, Plus, Trash2, CalendarOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { translateDbError } from "@/lib/api/error-messages";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/dashboard/horarios")({
  component: HorariosPage,
});

type Win = { start: string; end: string };
type DayConfig = { enabled: boolean; windows: Win[] };

const DEFAULT_WIN: Win = { start: "09:00", end: "19:00" };
const emptyDay = (): DayConfig => ({ enabled: false, windows: [{ ...DEFAULT_WIN }] });

/** Tramos válidos: fin posterior al inicio y sin solaparse entre sí. */
function windowsError(windows: Win[]): string | null {
  for (const w of windows) {
    if (minutesBetween(w.start, w.end) <= 0)
      return "La hora de cierre debe ser posterior a la apertura.";
  }
  const sorted = [...windows].sort((a, b) => a.start.localeCompare(b.start));
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].start < sorted[i - 1].end) return "Los tramos del día no pueden solaparse.";
  }
  return null;
}

function minutesBetween(start: string, end: string) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return Math.max(0, eh * 60 + em - (sh * 60 + sm));
}
function fmtDuration(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

function HorariosPage() {
  const { data: business } = useMyBusiness();
  const qc = useQueryClient();
  const businessId = business?.id;

  const { data: rules } = useQuery({
    queryKey: ["rules", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("availability_rules")
        .select("*")
        .eq("business_id", businessId!);
      if (error) throw error;
      return data;
    },
  });

  const [days, setDays] = useState<DayConfig[]>(() => Array.from({ length: 7 }, emptyDay));
  const [initial, setInitial] = useState<DayConfig[] | null>(null);

  useEffect(() => {
    if (!rules) return;
    const next: DayConfig[] = Array.from({ length: 7 }, emptyDay);
    const byDay = new Map<number, Win[]>();
    for (const r of rules) {
      const list = byDay.get(r.day_of_week) ?? [];
      list.push({ start: r.start_time.slice(0, 5), end: r.end_time.slice(0, 5) });
      byDay.set(r.day_of_week, list);
    }
    for (const [d, list] of byDay)
      next[d] = { enabled: true, windows: list.sort((a, b) => a.start.localeCompare(b.start)) };
    setDays(next);
    setInitial(next);
  }, [rules]);

  // Guardado atómico: la función reemplaza todos los tramos en una sola transacción.
  const save = useMutation({
    mutationFn: async () => {
      if (!businessId) throw new Error("Sin negocio");
      const rows = days.flatMap((d, i) =>
        d.enabled
          ? d.windows.map((w) => ({ day_of_week: i, start_time: w.start, end_time: w.end }))
          : [],
      );
      const { error } = await supabase.rpc("replace_availability_rules", {
        _business_id: businessId,
        _rules: rows,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rules"] });
      toast.success("Horarios guardados");
      setInitial(days);
    },
    onError: (e: Error) => toast.error(translateDbError(e)),
  });

  // Cierres puntuales (feriados, vacaciones)
  const { data: closures } = useQuery({
    queryKey: ["closures", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("availability_exceptions")
        .select("*")
        .eq("business_id", businessId!)
        .gte("ends_on", today)
        .order("starts_on");
      if (error) throw error;
      return data;
    },
  });
  const [closeFrom, setCloseFrom] = useState("");
  const [closeTo, setCloseTo] = useState("");
  const [closeNote, setCloseNote] = useState("");
  const addClosure = useMutation({
    mutationFn: async () => {
      if (!businessId || !closeFrom) throw new Error("Elige la fecha del cierre");
      const to = closeTo || closeFrom;
      if (to < closeFrom) throw new Error("La fecha final no puede ser anterior a la inicial");
      const { error } = await supabase.from("availability_exceptions").insert({
        business_id: businessId,
        starts_on: closeFrom,
        ends_on: to,
        note: closeNote.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["closures", businessId] });
      setCloseFrom("");
      setCloseTo("");
      setCloseNote("");
      toast.success("Cierre agregado");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const removeClosure = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("availability_exceptions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["closures", businessId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  if (!business) return <p className="text-muted-foreground">Primero crea tu salón.</p>;

  const dirty = initial ? JSON.stringify(initial) !== JSON.stringify(days) : false;
  const openCount = days.filter((d) => d.enabled).length;
  const totalMinutes = days.reduce(
    (acc, d) =>
      acc + (d.enabled ? d.windows.reduce((a, w) => a + minutesBetween(w.start, w.end), 0) : 0),
    0,
  );
  const hasInvalid = days.some((d) => d.enabled && windowsError(d.windows) !== null);

  function updateWindow(day: number, idx: number, patch: Partial<Win>) {
    setDays((p) =>
      p.map((x, i) =>
        i === day
          ? { ...x, windows: x.windows.map((w, j) => (j === idx ? { ...w, ...patch } : w)) }
          : x,
      ),
    );
  }
  function addWindow(day: number) {
    setDays((p) =>
      p.map((x, i) => {
        if (i !== day) return x;
        const last = x.windows[x.windows.length - 1];
        // Nuevo tramo después del último (típico turno partido: mañana + tarde).
        const start = last ? last.end : "15:00";
        const end = start < "20:00" ? "20:00" : "23:59";
        return { ...x, windows: [...x.windows, { start, end }] };
      }),
    );
  }
  function removeWindow(day: number, idx: number) {
    setDays((p) =>
      p.map((x, i) => (i === day ? { ...x, windows: x.windows.filter((_, j) => j !== idx) } : x)),
    );
  }
  function setAll(start: string, end: string, indices: number[]) {
    setDays((prev) =>
      prev.map((x, i) => (indices.includes(i) ? { enabled: true, windows: [{ start, end }] } : x)),
    );
  }
  function clearAll() {
    setDays((prev) => prev.map((x) => ({ ...x, enabled: false })));
  }
  function applyPreset(p: "weekdays" | "weekend" | "everyday" | "morning" | "evening") {
    if (p === "weekdays") setAll("09:00", "19:00", [1, 2, 3, 4, 5]);
    if (p === "weekend") setAll("10:00", "18:00", [0, 6]);
    if (p === "everyday") setAll("09:00", "19:00", [0, 1, 2, 3, 4, 5, 6]);
    if (p === "morning")
      setDays((prev) =>
        prev.map((x) => (x.enabled ? { ...x, windows: [{ start: "08:00", end: "13:00" }] } : x)),
      );
    if (p === "evening")
      setDays((prev) =>
        prev.map((x) => (x.enabled ? { ...x, windows: [{ start: "14:00", end: "20:00" }] } : x)),
      );
  }
  function copyTo(fromIdx: number, toAll: boolean) {
    const src = days[fromIdx];
    if (toAll) {
      setDays((prev) =>
        prev.map((x, i) =>
          i === fromIdx ? x : { enabled: true, windows: src.windows.map((w) => ({ ...w })) },
        ),
      );
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl mb-1">Horarios</h1>
          <p className="text-muted-foreground">Define cuándo aceptas reservas a la semana.</p>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <CalendarCheck2 className="size-4" /> {openCount} día{openCount === 1 ? "" : "s"}{" "}
            abiertos
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="size-4" /> {fmtDuration(totalMinutes)} / semana
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => applyPreset("weekdays")}>
          Lun – Vie
        </Button>
        <Button variant="outline" size="sm" onClick={() => applyPreset("weekend")}>
          Fin de semana
        </Button>
        <Button variant="outline" size="sm" onClick={() => applyPreset("everyday")}>
          Todos los días
        </Button>
        <Button variant="outline" size="sm" onClick={() => applyPreset("morning")}>
          <Sun className="size-3.5 mr-1.5" />
          Solo mañanas
        </Button>
        <Button variant="outline" size="sm" onClick={() => applyPreset("evening")}>
          <Moon className="size-3.5 mr-1.5" />
          Solo tardes
        </Button>
        <Button variant="ghost" size="sm" onClick={clearAll}>
          Cerrar todos
        </Button>
      </div>

      <Card>
        <CardContent className="p-0 divide-y">
          {days.map((d, i) => {
            const dur = d.enabled
              ? d.windows.reduce((a, w) => a + Math.max(0, minutesBetween(w.start, w.end)), 0)
              : 0;
            const err = d.enabled ? windowsError(d.windows) : null;
            return (
              <div
                key={i}
                className={cn(
                  "px-4 sm:px-5 py-4 transition-colors",
                  d.enabled ? "bg-card" : "bg-muted/20",
                )}
              >
                <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                  <div className="flex items-center gap-3 sm:w-44 shrink-0 sm:pt-1.5">
                    <Switch
                      checked={d.enabled}
                      onCheckedChange={(v) =>
                        setDays((p) => p.map((x, idx) => (idx === i ? { ...x, enabled: v } : x)))
                      }
                    />
                    <div>
                      <p
                        className={cn("font-medium text-sm", !d.enabled && "text-muted-foreground")}
                      >
                        {DAY_NAMES[i]}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {d.enabled ? fmtDuration(dur) + " disponible" : "Cerrado"}
                      </p>
                    </div>
                  </div>

                  {d.enabled ? (
                    <div className="flex-1 space-y-2">
                      {d.windows.map((w, j) => (
                        <div key={j} className="flex items-center gap-2">
                          <Input
                            type="time"
                            value={w.start}
                            onChange={(e) => updateWindow(i, j, { start: e.target.value })}
                            className={cn("w-28 h-9", err && "border-destructive")}
                          />
                          <span className="text-muted-foreground text-sm">—</span>
                          <Input
                            type="time"
                            value={w.end}
                            onChange={(e) => updateWindow(i, j, { end: e.target.value })}
                            className={cn("w-28 h-9", err && "border-destructive")}
                          />
                          {d.windows.length > 1 && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-9"
                              aria-label="Quitar tramo"
                              onClick={() => removeWindow(i, j)}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          )}
                          {j === d.windows.length - 1 && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-9"
                                aria-label="Agregar tramo (turno partido o descanso)"
                                title="Agregar tramo"
                                onClick={() => addWindow(i)}
                              >
                                <Plus className="size-4" />
                              </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-9"
                                    aria-label="Copiar horario"
                                  >
                                    <Copy className="size-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => copyTo(i, true)}>
                                    Copiar a todos los días
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </>
                          )}
                        </div>
                      ))}
                      {err && <p className="text-xs text-destructive">{err}</p>}
                      {!err && (
                        <div className="relative h-1.5 bg-muted rounded-full overflow-hidden mt-1">
                          {d.windows.map((w, j) => {
                            const s0 = (minutesBetween("00:00", w.start) / 1440) * 100;
                            const wd = Math.max(1, (minutesBetween(w.start, w.end) / 1440) * 100);
                            return (
                              <div
                                key={j}
                                className="absolute top-0 h-full bg-primary rounded-full"
                                style={{ left: `${s0}%`, width: `${wd}%` }}
                              />
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex-1 text-sm text-muted-foreground italic sm:pt-1.5">
                      Sin atención este día
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div>
            <h2 className="font-display text-xl mb-1 flex items-center gap-2">
              <CalendarOff className="size-5" /> Cierres y feriados
            </h2>
            <p className="text-sm text-muted-foreground">
              Días en los que no recibes reservas aunque el horario semanal esté abierto (feriados,
              vacaciones).
            </p>
          </div>
          <div className="grid sm:grid-cols-[1fr_1fr_1.5fr_auto] gap-2 items-end">
            <div>
              <label className="text-xs text-muted-foreground">Desde</label>
              <Input type="date" value={closeFrom} onChange={(e) => setCloseFrom(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Hasta (opcional)</label>
              <Input
                type="date"
                value={closeTo}
                min={closeFrom || undefined}
                onChange={(e) => setCloseTo(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Motivo (opcional)</label>
              <Input
                value={closeNote}
                maxLength={120}
                onChange={(e) => setCloseNote(e.target.value)}
                placeholder="Ej. Feriado nacional"
              />
            </div>
            <Button
              onClick={() => addClosure.mutate()}
              disabled={!closeFrom || addClosure.isPending}
            >
              Agregar
            </Button>
          </div>
          {(closures?.length ?? 0) > 0 ? (
            <ul className="divide-y border rounded-lg">
              {closures!.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                >
                  <span>
                    {c.starts_on === c.ends_on ? c.starts_on : `${c.starts_on} → ${c.ends_on}`}
                    {c.note ? <span className="text-muted-foreground"> · {c.note}</span> : null}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    aria-label="Quitar cierre"
                    onClick={() => removeClosure.mutate(c.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground italic">No tienes cierres próximos.</p>
          )}
        </CardContent>
      </Card>

      <div className="sticky bottom-4 flex items-center justify-between gap-3 bg-card border border-border rounded-xl px-4 py-3 shadow-soft">
        <p className="text-sm text-muted-foreground">
          {hasInvalid ? (
            <span className="text-destructive">
              Corrige los horarios marcados antes de guardar.
            </span>
          ) : dirty ? (
            "Tienes cambios sin guardar"
          ) : (
            "Todos los cambios guardados"
          )}
        </p>
        <div className="flex gap-2">
          {dirty && initial && (
            <Button variant="ghost" onClick={() => setDays(initial)}>
              Descartar
            </Button>
          )}
          <Button onClick={() => save.mutate()} disabled={save.isPending || !dirty || hasInvalid}>
            {save.isPending ? "Guardando…" : "Guardar cambios"}
          </Button>
        </div>
      </div>
    </div>
  );
}
