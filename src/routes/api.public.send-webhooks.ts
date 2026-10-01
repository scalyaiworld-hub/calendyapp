import { createFileRoute } from "@tanstack/react-router";

// Lo llama el cron cada minuto (ver la migración de integraciones). Se autentica con REMINDERS_CRON_SECRET.
export const Route = createFileRoute("/api/public/send-webhooks")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { checkCronAuth } = await import("@/lib/cron-auth.server");
        const denied = checkCronAuth(request);
        if (denied) return denied;
        try {
          const [{ supabaseAdmin }, { sendDueWebhooks }] = await Promise.all([
            import("@/integrations/supabase/client.server"),
            import("@/lib/webhooks.server"),
          ]);
          return Response.json({ ok: true, ...(await sendDueWebhooks(supabaseAdmin)) });
        } catch (e) {
          console.error("[webhooks] run failed", e);
          return Response.json({ ok: false, error: "run_failed" }, { status: 500 });
        }
      },
    },
  },
});
