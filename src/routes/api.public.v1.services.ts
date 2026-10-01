import { createFileRoute } from "@tanstack/react-router";

// GET /api/public/v1/services?limit=&offset= — servicios del negocio (sin eliminados). Solo lectura.
export const Route = createFileRoute("/api/public/v1/services")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const [{ supabaseAdmin }, api] = await Promise.all([
          import("@/integrations/supabase/client.server"),
          import("@/lib/api-v1.server"),
        ]);
        const auth = await api.authenticateApiRequest(request, supabaseAdmin);
        if (auth instanceof Response) return auth;
        const page = api.parsePage(new URL(request.url));
        if (page instanceof Response) return page;

        const { data, error } = await supabaseAdmin
          .from("services")
          .select("id,name,description,duration_minutes,price_cents,is_active,created_at")
          .eq("business_id", auth.businessId)
          .is("deleted_at", null)
          .order("display_order", { ascending: true })
          .order("id", { ascending: true })
          .range(page.offset, page.offset + page.limit);
        if (error) return api.apiError(500, "internal", "Error interno.");
        return api.pageResponse(data ?? [], page);
      },
    },
  },
});
