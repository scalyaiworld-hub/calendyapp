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
import { Clock, Copy, CalendarCheck2, Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/dashboard/horarios")({
  component: HorariosPage,
});

type DayConfig = { enabled: boolean; start: string; end: string };

function minutesBetween(start: string, end: string) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return Math.max(0, (eh * 60 + em) - (sh * 60 + sm));
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
      const { data, error } = await supabase.from("availability_rules").select("*").eq("business_id", businessId!);
      if (error) throw error;
      return data;
    },
  });

  const [days, setDays] = useState<DayConfig[]>(() => Array.from({ length: 7 }, () => ({ enabled: false, start: "09:00", end: "19:00" })));
  const [initial, setInitial] = useState<DayConfig[] | null>(null);

  useEffect(() => {
    if (!rules) return;
    const next: DayConfig[] = Array.from({ length: 7 }, () => ({ enabled: false, start: "09:00", end: "19:00" }));
    for (const r of rules) {
      next[r.day_of_week] = { enabled: true, start: r.start_time.slice(0, 5), end: r.end_time.slice(0, 5) };
    }
    setDays(next);
    setInitial(next);
  }, [rules]);

  const save = useMutation({
    mutationFn: async () => {
      if (!businessId) throw new Error("Sin negocio");
      await supabase.from("availability_rules").delete().eq("business_id", businessId);
      const rows = days.flatMap((d, i) => d.enabled ? [{ business_id: businessId, day_of_week: i, start_time: d.start, end_time: d.end }] : []);
      if (rows.length) {
        const { error } = await supabase.from("availability_rules").insert(rows);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["rules"] }); toast.success("Horarios guardados"); setInitial(days); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!business) return <p className="text-muted-foreground">Primero crea tu salón.</p>;

  const dirty = initial ? JSON.stringify(initial) !== JSON.stringify(days) : false;
  const openCount = days.filter((d) => d.enabled).length;
  const totalMinutes = days.reduce((acc, d) => acc + (d.enabled ? minutesBetween(d.start, d.end) : 0), 0);
  const hasInvalid = days.some((d) => d.enabled && minutesBetween(d.start, d.end) <= 0);

  function setAll(start: string, end: string, indices: number[]) {
    setDays((prev) => prev.map((x, i) => indices.includes(i) ? { enabled: true, start, end } : x));
  }
  function clearAll() { setDays((prev) => prev.map((x) => ({ ...x, enabled: false }))); }
  function applyPreset(p: "weekdays" | "weekend" | "everyday" | "morning" | "evening") {
    if (p === "weekdays") setAll("09:00", "19:00", [1, 2, 3, 4, 5]);
    if (p === "weekend") setAll("10:00", "18:00", [0, 6]);
    if (p === "everyday") setAll("09:00", "19:00", [0, 1, 2, 3, 4, 5, 6]);
    if (p === "morning") setDays((prev) => prev.map((x) => x.enabled ? { ...x, start: "08:00", end: "13:00" } : x));
    if (p === "evening") setDays((prev) => prev.map((x) => x.enabled ? { ...x, start: "14:00", end: "20:00" } : x));
  }
  function copyTo(fromIdx: number, toAll: boolean) {
    const src = days[fromIdx];
    if (toAll) {
      setDays((prev) => prev.map((x, i) => i === fromIdx ? x : { enabled: true, start: src.start, end: src.end }));
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
            <CalendarCheck2 className="size-4" /> {openCount} día{openCount === 1 ? "" : "s"} abiertos
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="size-4" /> {fmtDuration(totalMinutes)} / semana
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => applyPreset("weekdays")}>Lun – Vie</Button>
        <Button variant="outline" size="sm" onClick={() => applyPreset("weekend")}>Fin de semana</Button>
        <Button variant="outline" size="sm" onClick={() => applyPreset("everyday")}>Todos los días</Button>
        <Button variant="outline" size="sm" onClick={() => applyPreset("morning")}><Sun className="size-3.5 mr-1.5" />Solo mañanas</Button>
        <Button variant="outline" size="sm" onClick={() => applyPreset("evening")}><Moon className="size-3.5 mr-1.5" />Solo tardes</Button>
        <Button variant="ghost" size="sm" onClick={clearAll}>Cerrar todos</Button>
      </div>

      <Card>
        <CardContent className="p-0 divide-y">
          {days.map((d, i) => {
            const dur = d.enabled ? minutesBetween(d.start, d.end) : 0;
            const invalid = d.enabled && dur <= 0;
            const [sh] = d.start.split(":").map(Number);
            const [eh] = d.end.split(":").map(Number);
            const leftPct = (sh / 24) * 100;
            const widthPct = Math.max(2, ((eh - sh) / 24) * 100);
            return (
              <div key={i} className={cn("px-4 sm:px-5 py-4 transition-colors", d.enabled ? "bg-card" : "bg-muted/20")}>
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex items-center gap-3 sm:w-44 shrink-0">
                    <Switch
                      checked={d.enabled}
                      onCheckedChange={(v) => setDays((p) => p.map((x, idx) => idx === i ? { ...x, enabled: v } : x))}
                    />
                    <div>
                      <p className={cn("font-medium text-sm", !d.enabled && "text-muted-foreground")}>{DAY_NAMES[i]}</p>
                      <p className="text-xs text-muted-foreground">{d.enabled ? fmtDuration(dur) + " disponible" : "Cerrado"}</p>
                    </div>
                  </div>

                  {d.enabled ? (
                    <div className="flex flex-1 items-center gap-2">
                      <Input
                        type="time" value={d.start}
                        onChange={(e) => setDays((p) => p.map((x, idx) => idx === i ? { ...x, start: e.target.value } : x))}
                        className={cn("w-28 h-9", invalid && "border-destructive")}
                      />
                      <span className="text-muted-foreground text-sm">—</span>
                      <Input
                        type="time" value={d.end}
                        onChange={(e) => setDays((p) => p.map((x, idx) => idx === i ? { ...x, end: e.target.value } : x))}
                        className={cn("w-28 h-9", invalid && "border-destructive")}
                      />
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-9" aria-label="Copiar horario">
                            <Copy className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => copyTo(i, true)}>
                            Copiar a todos los días
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ) : (
                    <div className="flex-1 text-sm text-muted-foreground italic">Sin atención este día</div>
                  )}
                </div>

                {d.enabled && !invalid && (
                  <div className="mt-3 ml-0 sm:ml-44">
                    <div className="relative h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="absolute top-0 h-full bg-primary rounded-full"
                        style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                      <span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>24h</span>
                    </div>
                  </div>
                )}
                {invalid && (
                  <p className="text-xs text-destructive mt-2 ml-0 sm:ml-44">La hora de cierre debe ser posterior a la apertura.</p>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="sticky bottom-4 flex items-center justify-between gap-3 bg-card border border-border rounded-xl px-4 py-3 shadow-soft">
        <p className="text-sm text-muted-foreground">
          {hasInvalid
            ? <span className="text-destructive">Corrige los horarios marcados antes de guardar.</span>
            : dirty ? "Tienes cambios sin guardar" : "Todos los cambios guardados"}
        </p>
        <div className="flex gap-2">
          {dirty && initial && (
            <Button variant="ghost" onClick={() => setDays(initial)}>Descartar</Button>
          )}
          <Button onClick={() => save.mutate()} disabled={save.isPending || !dirty || hasInvalid}>
            {save.isPending ? "Guardando…" : "Guardar cambios"}
          </Button>
        </div>
      </div>
    </div>
  );
}