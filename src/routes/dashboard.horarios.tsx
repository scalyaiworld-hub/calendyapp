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

export const Route = createFileRoute("/dashboard/horarios")({
  component: HorariosPage,
});

type DayConfig = { enabled: boolean; start: string; end: string };

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

  useEffect(() => {
    if (!rules) return;
    const next: DayConfig[] = Array.from({ length: 7 }, () => ({ enabled: false, start: "09:00", end: "19:00" }));
    for (const r of rules) {
      next[r.day_of_week] = { enabled: true, start: r.start_time.slice(0, 5), end: r.end_time.slice(0, 5) };
    }
    setDays(next);
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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["rules"] }); toast.success("Horarios guardados"); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!business) return <p className="text-muted-foreground">Primero crea tu salón.</p>;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="font-display text-3xl mb-1">Horarios</h1>
        <p className="text-muted-foreground">Cuándo aceptas reservas.</p>
      </div>
      <Card>
        <CardContent className="pt-6 space-y-3">
          {days.map((d, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-24 text-sm">{DAY_NAMES[i]}</div>
              <Switch checked={d.enabled} onCheckedChange={(v) => setDays((p) => p.map((x, idx) => idx === i ? { ...x, enabled: v } : x))} />
              <Input type="time" value={d.start} disabled={!d.enabled} onChange={(e) => setDays((p) => p.map((x, idx) => idx === i ? { ...x, start: e.target.value } : x))} className="w-32" />
              <span className="text-muted-foreground">—</span>
              <Input type="time" value={d.end} disabled={!d.enabled} onChange={(e) => setDays((p) => p.map((x, idx) => idx === i ? { ...x, end: e.target.value } : x))} className="w-32" />
            </div>
          ))}
        </CardContent>
      </Card>
      <Button onClick={() => save.mutate()} disabled={save.isPending}>Guardar cambios</Button>
    </div>
  );
}