// Cálculo puro de métricas a partir de las citas del período (sin red ni base de datos).

export type MetricAppt = {
  starts_at: string;
  status: "pending" | "booked" | "completed" | "cancelled" | "no_show";
  source: string;
  service_id: string;
  professional_id: string | null;
  client_id: string;
};

export type Named = { name: string; price_cents?: number };

export type RankedItem = { id: string; name: string; count: number; revenueCents: number };

export type Metrics = {
  totals: { total: number; completed: number; cancelled: number; noShow: number; upcoming: number };
  revenueCents: number;
  cancellationRate: number; // 0..1 sobre el total de citas
  noShowRate: number; // 0..1 sobre citas ya resueltas (completadas + no-show)
  avgTicketCents: number;
  uniqueClients: number;
  recurringClients: number; // clientes con 2 o más citas (no canceladas) en el período
  byService: RankedItem[];
  byProfessional: RankedItem[];
  byWeekday: number[]; // 0 = domingo
  byHour: number[]; // 0..23, hora local del negocio
  bySource: { source: string; count: number }[];
  byDay: { date: string; count: number }[]; // YYYY-MM-DD local, días sin citas incluidos
};

const DEFAULT_TZ = "America/Lima";

/** Fecha y hora local en la zona del negocio; si la zona es inválida usa Lima. */
export function localParts(
  date: Date,
  timezone: string,
): { ymd: string; weekday: number; hour: number } {
  const make = (tz: string) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
    return {
      ymd: `${get("year")}-${get("month")}-${get("day")}`,
      weekday,
      hour: Number(get("hour")),
    };
  };
  try {
    return make(timezone);
  } catch {
    return make(DEFAULT_TZ);
  }
}

function rank(
  map: Map<string, { count: number; revenueCents: number }>,
  names: Map<string, Named>,
  limit: number,
): RankedItem[] {
  return [...map.entries()]
    .map(([id, v]) => ({ id, name: names.get(id)?.name ?? "—", ...v }))
    .sort((a, b) => b.count - a.count || b.revenueCents - a.revenueCents)
    .slice(0, limit);
}

export function computeMetrics(
  appts: MetricAppt[],
  opts: {
    services: Map<string, Named>;
    professionals: Map<string, Named>;
    timezone: string;
    from: Date;
    to: Date;
  },
): Metrics {
  const totals = { total: appts.length, completed: 0, cancelled: 0, noShow: 0, upcoming: 0 };
  let revenueCents = 0;
  const svc = new Map<string, { count: number; revenueCents: number }>();
  const pro = new Map<string, { count: number; revenueCents: number }>();
  const byWeekday = Array<number>(7).fill(0);
  const byHour = Array<number>(24).fill(0);
  const source = new Map<string, number>();
  const dayCount = new Map<string, number>();
  const clientCount = new Map<string, number>();

  for (const a of appts) {
    if (a.status === "cancelled") {
      totals.cancelled++;
      continue; // las canceladas no cuentan para demanda, ingresos ni horarios
    }
    if (a.status === "no_show") totals.noShow++;
    else if (a.status === "completed") totals.completed++;
    else totals.upcoming++;

    const when = localParts(new Date(a.starts_at), opts.timezone);
    byWeekday[when.weekday]++;
    byHour[when.hour]++;
    dayCount.set(when.ymd, (dayCount.get(when.ymd) ?? 0) + 1);
    source.set(a.source, (source.get(a.source) ?? 0) + 1);
    clientCount.set(a.client_id, (clientCount.get(a.client_id) ?? 0) + 1);

    // Ingreso = solo citas completadas, al precio actual del servicio.
    const price =
      a.status === "completed" ? (opts.services.get(a.service_id)?.price_cents ?? 0) : 0;
    revenueCents += price;

    const s = svc.get(a.service_id) ?? { count: 0, revenueCents: 0 };
    s.count++;
    s.revenueCents += price;
    svc.set(a.service_id, s);

    if (a.professional_id) {
      const p = pro.get(a.professional_id) ?? { count: 0, revenueCents: 0 };
      p.count++;
      p.revenueCents += price;
      pro.set(a.professional_id, p);
    }
  }

  // Serie diaria continua entre from y to (días locales).
  const byDay: { date: string; count: number }[] = [];
  const end = localParts(opts.to, opts.timezone).ymd;
  let cursor = new Date(opts.from);
  for (let i = 0; i < 800; i++) {
    const ymd = localParts(cursor, opts.timezone).ymd;
    if (byDay.length === 0 || byDay[byDay.length - 1].date !== ymd)
      byDay.push({ date: ymd, count: dayCount.get(ymd) ?? 0 });
    if (ymd >= end) break;
    cursor = new Date(cursor.getTime() + 12 * 3600_000); // pasos de 12 h: nunca se salta un día
  }

  const resolved = totals.completed + totals.noShow;
  return {
    totals,
    revenueCents,
    cancellationRate: totals.total ? totals.cancelled / totals.total : 0,
    noShowRate: resolved ? totals.noShow / resolved : 0,
    avgTicketCents: totals.completed ? Math.round(revenueCents / totals.completed) : 0,
    uniqueClients: clientCount.size,
    recurringClients: [...clientCount.values()].filter((n) => n >= 2).length,
    byService: rank(svc, opts.services, 5),
    byProfessional: rank(pro, opts.professionals, 5),
    byWeekday,
    byHour,
    bySource: [...source.entries()]
      .map(([s, count]) => ({ source: s, count }))
      .sort((a, b) => b.count - a.count),
    byDay,
  };
}
