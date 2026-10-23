import { createFileRoute } from "@tanstack/react-router";

// Lo llama el cron cada minuto (ver la migración de Google Calendar). Se autentica con REMINDERS_CRON_SECRET.
export const Route = createFileRoute("/api/public/sync-google-calendar")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { checkCronAuth } = await import("@/lib/cron-auth.server");
        const denied = checkCronAuth(request);
        if (denied) return denied;
        try {
          const [{ supabaseAdmin }, { syncDueGoogleCalendarJobs }] = await Promise.all([
            import("@/integrations/supabase/client.server"),
            import("@/lib/google-calendar-sync.server"),
          ]);
          return Response.json({ ok: true, ...(await syncDueGoogleCalendarJobs(supabaseAdmin)) });
        } catch (e) {
          console.error("[google-calendar] run failed", e);
          return Response.json({ ok: false, error: "run_failed" }, { status: 500 });
        }
      },
    },
  },
});
