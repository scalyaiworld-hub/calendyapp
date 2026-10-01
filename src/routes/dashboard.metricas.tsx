import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Download, Lock } from "lucide-react";
import { toast } from "sonner";
import { useMyBusiness } from "@/lib/business";
import { PlanGate, useModuleAccess } from "@/components/PlanGate";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BlockSkeleton } from "@/components/Skeletons";
import { formatPriceCents } from "@/lib/format";
import { minPlanForModule } from "@/lib/plans";
import { DAY_NAMES_SHORT } from "@/lib/format";
import { exportAppointmentsCsv, getAdvancedMetrics } from "@/lib/api/metrics.functions";

export const Route = createFileRoute("/dashboard/metricas")({
  head: () => ({ meta: [{ title: "Métricas — Calendya" }] }),
  component: MetricsPage,
});

const PERIODS = [
  { days: 7, label: "7 días" },
  { days: 30, label: "30 días" },
  { days: 90, label: "90 días" },
  { days: 365, label: "12 meses" },
] as const;
type Days = (typeof PERIODS)[number]["days"];

const SOURCE_LABEL: Record<string, string> = {
  manual: "Manual",
  booking_page: "Página pública",
  chat_ai: "Chat IA",
  whatsapp: "WhatsApp",
};

const pct = (n: number) => `${(n * 100).toFixed(n > 0 && n < 0.1 ? 1 : 0)}%`;

function MetricsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Métricas"
        description="Cómo va tu negocio: ingresos, asistencia y horarios con más demanda."
      />
      <PlanGate module="advancedMetrics">
        <MetricsBody />
      </PlanGate>
    </div>
  );
}

function MetricsBody() {
  const { data: business } = useMyBusiness();
  const [days, setDays] = useState<Days>(30);
  const exportsAccess = useModuleAccess("exports");

  const { data, isLoading, error } = useQuery({
    queryKey: ["metrics", business?.id, days],
    enabled: !!business,
    staleTime: 60_000,
    queryFn: () => getAdvancedMetrics({ data: { businessId: business!.id, days } }),
  });

  const exportCsv = useMutation({
    mutationFn: () => exportAppointmentsCsv({ data: { businessId: business!.id, days } }),
    onSuccess: ({ csv, rows, truncated }) => {
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `citas-${business!.slug}-${days}d.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(
        `${rows} citas exportadas${truncated ? " (se alcanzó el máximo de 10 000)" : ""}`,
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const m = data?.metrics;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="inline-flex rounded-lg border border-border p-0.5 bg-card"
          role="group"
          aria-label="Período"
        >
          {PERIODS.map((p) => (
            <button
              key={p.days}
              type="button"
              onClick={() => setDays(p.days)}
              aria-pressed={days === p.days}
              className={`px-3 py-1.5 text-sm rounded-md transition ${days === p.days ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {exportsAccess.allowed ? (
          <Button
            variant="outline"
            onClick={() => exportCsv.mutate()}
            disabled={exportCsv.isPending}
          >
            <Download className="size-4 mr-2" />{" "}
            {exportCsv.isPending ? "Exportando…" : "Exportar CSV"}
          </Button>
        ) : (
          <span
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
            title="Exporta tus citas a Excel"
          >
            <Lock className="size-3.5" /> Exportar CSV · plan {minPlanForModule("exports").label}
          </span>
        )}
      </div>

      {error && (
        <p className="text-sm text-destructive">
          No pudimos cargar las métricas. {(error as Error).message}
        </p>
      )}
      {isLoading && <BlockSkeleton className="h-40 w-full" />}

      {m && (
        <>
          {data.truncated && (
            <p className="text-xs text-muted-foreground">
              Mostrando las primeras 10 000 citas del período; elige un período más corto para ver
              todo.
            </p>
          )}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Stat
              label="Ingresos"
              value={formatPriceCents(m.revenueCents)}
              hint="Solo citas completadas"
            />
            <Stat
              label="Citas"
              value={String(m.totals.total - m.totals.cancelled)}
              hint={`${m.totals.cancelled} canceladas`}
            />
            <Stat
              label="Cancelaciones"
              value={pct(m.cancellationRate)}
              hint="Sobre el total de citas"
            />
            <Stat label="No asistieron" value={pct(m.noShowRate)} hint="Sobre citas resueltas" />
            <Stat
              label="Ticket promedio"
              value={formatPriceCents(m.avgTicketCents)}
              hint="Por cita completada"
            />
            <Stat label="Clientes" value={String(m.uniqueClients)} hint="Únicos en el período" />
            <Stat label="Recurrentes" value={String(m.recurringClients)} hint="Con 2 o más citas" />
            <Stat
              label="Próximas"
              value={String(m.totals.upcoming)}
              hint="Pendientes o agendadas"
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Citas por día</CardTitle>
            </CardHeader>
            <CardContent>
              <DayBars days={m.byDay} />
            </CardContent>
          </Card>

          <div className="grid lg:grid-cols-2 gap-4">
            <RankCard title="Servicios más pedidos" items={m.byService} />
            <RankCard
              title="Rendimiento por profesional"
              items={m.byProfessional}
              empty="Aún no hay citas con profesional asignado."
            />
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Días con más demanda</CardTitle>
              </CardHeader>
              <CardContent>
                <Bars labels={DAY_NAMES_SHORT} values={m.byWeekday} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Horas con más demanda</CardTitle>
              </CardHeader>
              <CardContent>
                <HourBars values={m.byHour} />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Origen de las reservas</CardTitle>
            </CardHeader>
            <CardContent>
              {m.bySource.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin datos en este período.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {m.bySource.map((s) => (
                    <li key={s.source} className="flex justify-between">
                      <span>{SOURCE_LABEL[s.source] ?? s.source}</span>
                      <span className="font-medium tabular-nums">{s.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-display text-2xl font-semibold mt-1 tabular-nums">{value}</p>
        <p className="text-xs text-muted-foreground mt-1">{hint}</p>
      </CardContent>
    </Card>
  );
}

function RankCard({
  title,
  items,
  empty = "Sin datos en este período.",
}: {
  title: string;
  items: { id: string; name: string; count: number; revenueCents: number }[];
  empty?: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ul className="space-y-3">
            {items.map((i) => (
              <li key={i.id}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="truncate pr-2">{i.name}</span>
                  <span className="text-muted-foreground tabular-nums shrink-0">
                    {i.count} · {formatPriceCents(i.revenueCents)}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full"
                    style={{ width: `${(i.count / max) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function Bars({ labels, values }: { labels: readonly string[]; values: number[] }) {
  const max = Math.max(1, ...values);
  return (
    <div
      className="flex items-end gap-2 h-32"
      role="img"
      aria-label={labels.map((l, i) => `${l}: ${values[i]}`).join(", ")}
    >
      {values.map((v, i) => (
        <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1 h-full">
          <span className="text-[10px] text-muted-foreground tabular-nums">{v || ""}</span>
          <div
            className="w-full rounded-t bg-primary/80"
            style={{ height: `${(v / max) * 100}%`, minHeight: v ? 3 : 0 }}
          />
          <span className="text-[10px] text-muted-foreground">{labels[i]}</span>
        </div>
      ))}
    </div>
  );
}

function HourBars({ values }: { values: number[] }) {
  // Solo el rango con actividad (con un margen de 1 h) para que las barras sean legibles.
  const active = values.map((v, h) => (v ? h : -1)).filter((h) => h >= 0);
  if (active.length === 0)
    return <p className="text-sm text-muted-foreground">Sin datos en este período.</p>;
  const from = Math.max(0, Math.min(...active) - 1);
  const to = Math.min(23, Math.max(...active) + 1);
  const hours = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  return <Bars labels={hours.map((h) => `${h}h`)} values={hours.map((h) => values[h])} />;
}

function DayBars({ days }: { days: { date: string; count: number }[] }) {
  const max = Math.max(1, ...days.map((d) => d.count));
  if (days.every((d) => d.count === 0))
    return <p className="text-sm text-muted-foreground">Sin citas en este período.</p>;
  return (
    <div className="flex items-end gap-px h-28" role="img" aria-label="Citas por día">
      {days.map((d) => (
        <div
          key={d.date}
          title={`${d.date}: ${d.count}`}
          className="flex-1 min-w-px rounded-t-sm bg-primary/80"
          style={{ height: `${(d.count / max) * 100}%`, minHeight: d.count ? 2 : 0 }}
        />
      ))}
    </div>
  );
}
