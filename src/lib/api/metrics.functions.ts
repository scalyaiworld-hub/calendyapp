import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { assertModule } from "@/lib/api/plan-guard";
import { computeMetrics, type MetricAppt, type Metrics, type Named } from "@/lib/metrics";
import { toCsv } from "@/lib/csv";

const schema = z.object({
  businessId: z.string().uuid(),
  days: z.union([z.literal(7), z.literal(30), z.literal(90), z.literal(365)]),
});

const PAGE = 1000; // PostgREST devuelve como máximo 1000 filas por petición
const MAX_PAGES = 10;

type Db = SupabaseClient<Database>;

function range(days: number) {
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 3600_000);
  return { from, to };
}

/** Lee todas las páginas del período (hasta 10 000 filas) con el cliente del usuario: RLS limita a su negocio. */
async function fetchAll<T>(
  page: (offset: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
) {
  const rows: T[] = [];
  for (let i = 0; i < MAX_PAGES; i++) {
    const { data, error } = await page(i * PAGE);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

async function loadBusiness(supabase: Db, businessId: string) {
  const { data, error } = await supabase
    .from("businesses")
    .select("timezone")
    .eq("id", businessId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return { timezone: data?.timezone ?? "America/Lima" };
}

export type AdvancedMetrics = { metrics: Metrics; truncated: boolean; days: number };

export const getAdvancedMetrics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => schema.parse(input))
  .handler(async ({ data, context }): Promise<AdvancedMetrics> => {
    const { supabase } = context;
    await assertModule(supabase, data.businessId, "advancedMetrics");

    const { timezone } = await loadBusiness(supabase, data.businessId);
    const { from, to } = range(data.days);

    const [appts, services, professionals] = await Promise.all([
      fetchAll<MetricAppt>((offset) =>
        supabase
          .from("appointments")
          .select("starts_at,status,source,service_id,professional_id,client_id")
          .eq("business_id", data.businessId)
          .gte("starts_at", from.toISOString())
          .lte("starts_at", to.toISOString())
          .order("starts_at", { ascending: true })
          .range(offset, offset + PAGE - 1),
      ),
      supabase.from("services").select("id,name,price_cents").eq("business_id", data.businessId),
      supabase.from("professionals").select("id,name").eq("business_id", data.businessId),
    ]);
    if (services.error) throw new Error(services.error.message);
    if (professionals.error) throw new Error(professionals.error.message);

    const metrics = computeMetrics(appts.rows, {
      services: new Map<string, Named>(
        (services.data ?? []).map((s) => [s.id, { name: s.name, price_cents: s.price_cents }]),
      ),
      professionals: new Map<string, Named>(
        (professionals.data ?? []).map((p) => [p.id, { name: p.name }]),
      ),
      timezone,
      from,
      to,
    });
    return { metrics, truncated: appts.truncated, days: data.days };
  });

const STATUS_ES: Record<string, string> = {
  pending: "Pendiente",
  booked: "Agendada",
  completed: "Completada",
  cancelled: "Cancelada",
  no_show: "No asistió",
};

/** Exporta las citas del período en CSV. Módulo "exports" (Studio). */
export const exportAppointmentsCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => schema.parse(input))
  .handler(
    async ({ data, context }): Promise<{ csv: string; rows: number; truncated: boolean }> => {
      const { supabase } = context;
      await assertModule(supabase, data.businessId, "exports");

      const { timezone } = await loadBusiness(supabase, data.businessId);
      const { from, to } = range(data.days);

      type Row = {
        starts_at: string;
        ends_at: string;
        status: string;
        source: string;
        notes: string | null;
        clients: { name: string; phone: string; email: string | null } | null;
        services: { name: string; price_cents: number } | null;
        professionals: { name: string } | null;
      };
      const { rows, truncated } = await fetchAll<Row>(
        (offset) =>
          supabase
            .from("appointments")
            .select(
              "starts_at,ends_at,status,source,notes,clients(name,phone,email),services(name,price_cents),professionals(name)",
            )
            .eq("business_id", data.businessId)
            .gte("starts_at", from.toISOString())
            .lte("starts_at", to.toISOString())
            .order("starts_at", { ascending: true })
            .range(offset, offset + PAGE - 1) as unknown as PromiseLike<{
            data: Row[] | null;
            error: { message: string } | null;
          }>,
      );

      const fmt = (iso: string) =>
        new Intl.DateTimeFormat("sv-SE", {
          timeZone: timezone,
          dateStyle: "short",
          timeStyle: "short",
        }).format(new Date(iso));

      const csv = toCsv(
        [
          "Inicio",
          "Fin",
          "Estado",
          "Origen",
          "Cliente",
          "Teléfono",
          "Email",
          "Servicio",
          "Precio",
          "Profesional",
          "Notas",
        ],
        rows.map((r) => [
          fmt(r.starts_at),
          fmt(r.ends_at),
          STATUS_ES[r.status] ?? r.status,
          r.source,
          r.clients?.name,
          r.clients?.phone,
          r.clients?.email,
          r.services?.name,
          r.services ? (r.services.price_cents / 100).toFixed(2) : "",
          r.professionals?.name,
          r.notes,
        ]),
      );
      return { csv, rows: rows.length, truncated };
    },
  );
