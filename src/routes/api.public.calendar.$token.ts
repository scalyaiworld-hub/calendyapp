import { createFileRoute } from "@tanstack/react-router";

// GET /api/public/calendar/<token>.ics (el sufijo .ics es opcional) — feed iCalendar para suscribirse desde Google/Apple/Outlook.
// El token (32+ caracteres aleatorios) es la credencial; si no existe o el plan no incluye el módulo
// se responde 404 igual en ambos casos, para no revelar qué tokens son válidos.
export const Route = createFileRoute("/api/public/calendar/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const notFound = () => new Response("Not found", { status: 404 });
        const token = params.token.replace(/\.ics$/, ""); // la URL pública termina en .ics
        if (!token || token.length < 32 || token.length > 128 || !/^[A-Za-z0-9_-]+$/.test(token)) return notFound();

        const [{ supabaseAdmin }, { hasModule }, { buildIcs }] = await Promise.all([
          import("@/integrations/supabase/client.server"),
          import("@/lib/plans"),
          import("@/lib/ics"),
        ]);

        const { data: feed } = await supabaseAdmin.from("calendar_feeds").select("business_id").eq("token", token).maybeSingle();
        if (!feed) return notFound();
        const { data: biz } = await supabaseAdmin.from("businesses").select("name,plan,deleted_at").eq("id", feed.business_id).maybeSingle();
        if (!biz || biz.deleted_at || !hasModule(biz.plan, "integrations")) return notFound();

        const now = Date.now();
        const { data, error } = await supabaseAdmin
          .from("appointments")
          .select("id,status,starts_at,ends_at,notes,professional_id,clients(name,phone),services(name)")
          .eq("business_id", feed.business_id)
          .in("status", ["pending", "booked", "completed"])
          .gte("starts_at", new Date(now - 30 * 86400_000).toISOString())
          .lte("starts_at", new Date(now + 180 * 86400_000).toISOString())
          .order("starts_at", { ascending: true })
          .limit(2000);
        if (error) return new Response("Error", { status: 500 });

        const { professionalNames } = await import("@/lib/api-v1.server");
        const names = await professionalNames(supabaseAdmin, feed.business_id, (data ?? []).map((a) => a.professional_id));

        const ics = buildIcs({
          name: biz.name,
          events: (data ?? []).map((a) => ({
            id: a.id,
            startsAt: new Date(a.starts_at),
            endsAt: new Date(a.ends_at),
            summary: `${a.services?.name ?? "Cita"} — ${a.clients?.name ?? "Cliente"}`,
            description: [
              a.clients?.phone ? `Tel: ${a.clients.phone}` : null,
              a.professional_id && names.get(a.professional_id) ? `Profesional: ${names.get(a.professional_id)}` : null,
              a.notes ? `Notas: ${a.notes}` : null,
            ]
              .filter(Boolean)
              .join("\n"),
            status: a.status === "pending" ? ("TENTATIVE" as const) : ("CONFIRMED" as const),
          })),
        });
        return new Response(ics, {
          headers: {
            "Content-Type": "text/calendar; charset=utf-8",
            "Content-Disposition": 'inline; filename="calendya.ics"',
            "Cache-Control": "private, max-age=300",
            "X-Robots-Tag": "noindex",
          },
        });
      },
    },
  },
});
