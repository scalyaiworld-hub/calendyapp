import { createFileRoute } from "@tanstack/react-router";

// GET /api/public/v1/appointments?from=&to=&status=&limit=&offset=
// Autenticada con una clave de API del negocio (plan Studio). Solo lectura.
const STATUSES = ["pending", "booked", "completed", "cancelled", "no_show"] as const;
type Status = (typeof STATUSES)[number];

export const Route = createFileRoute("/api/public/v1/appointments")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const [{ supabaseAdmin }, api] = await Promise.all([import("@/integrations/supabase/client.server"), import("@/lib/api-v1.server")]);
        const auth = await api.authenticateApiRequest(request, supabaseAdmin);
        if (auth instanceof Response) return auth;

        const url = new URL(request.url);
        const page = api.parsePage(url);
        if (page instanceof Response) return page;
        const status = url.searchParams.get("status");
        if (status && !(STATUSES as readonly string[]).includes(status)) {
          return api.apiError(400, "invalid_parameter", `status debe ser uno de: ${STATUSES.join(", ")}.`);
        }

        let q = supabaseAdmin
          .from("appointments")
          .select("id,status,source,starts_at,ends_at,notes,created_at,professional_id,clients(id,name,phone,email),services(id,name,price_cents)")
          .eq("business_id", auth.businessId)
          .order("starts_at", { ascending: true })
          .order("id", { ascending: true })
          .range(page.offset, page.offset + page.limit); // limit + 1 filas
        if (page.from) q = q.gte("starts_at", page.from);
        if (page.to) q = q.lte("starts_at", page.to);
        if (status) q = q.eq("status", status as Status);

        const { data, error } = await q;
        if (error) return api.apiError(500, "internal", "Error interno.");
        const names = await api.professionalNames(supabaseAdmin, auth.businessId, (data ?? []).map((a) => a.professional_id));
        const rows = (data ?? []).map((a) => ({
          id: a.id,
          status: a.status,
          source: a.source,
          starts_at: a.starts_at,
          ends_at: a.ends_at,
          notes: a.notes,
          created_at: a.created_at,
          client: a.clients,
          service: a.services,
          professional: a.professional_id ? { id: a.professional_id, name: names.get(a.professional_id) ?? null } : null,
        }));
        return api.pageResponse(rows, page);
      },
    },
  },
});
