import { createFileRoute } from "@tanstack/react-router";
import process from "node:process";

// Lo llama el cron (pg_cron + pg_net, ver la migración de appointment_reminders).
// No tiene sesión de usuario: se autentica con el secreto REMINDERS_CRON_SECRET.

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const Route = createFileRoute("/api/public/send-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.REMINDERS_CRON_SECRET;
        // Sin secreto configurado (o demasiado corto) la ruta queda cerrada, nunca abierta.
        if (!secret || secret.length < 16) return new Response("Not configured", { status: 503 });

        const token = (request.headers.get("authorization") ?? "").replace(/^Bearer /, "");
        if (!safeEqual(token, secret)) return new Response("Unauthorized", { status: 401 });

        try {
          const [{ supabaseAdmin }, { sendEmail }, { sendDueReminders }] = await Promise.all([
            import("@/integrations/supabase/client.server"),
            import("@/lib/email.server"),
            import("@/lib/reminders.server"),
          ]);
          const result = await sendDueReminders(supabaseAdmin, sendEmail);
          return Response.json({ ok: true, ...result });
        } catch (e) {
          console.error("[reminders] run failed", e);
          return Response.json({ ok: false, error: "run_failed" }, { status: 500 });
        }
      },
    },
  },
});
