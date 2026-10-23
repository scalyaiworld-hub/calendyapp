import { createFileRoute } from "@tanstack/react-router";

// GET /api/google-calendar/callback — Google vuelve aquí tras el consentimiento.
// No hay sesión de Supabase en esta petición (viaja en el navegador, no en cookies): la identidad
// sale del `state` firmado que generó startGoogleCalendarConnect, y aquí se revalida dueño + plan.
// Ante cualquier fallo se vuelve a Integraciones con ?google=error, sin detalles.
export const Route = createFileRoute("/api/google-calendar/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const back = (result: "connected" | "error") =>
          new Response(null, {
            status: 302,
            headers: {
              Location: `/dashboard/integraciones?google=${result}`,
              "Cache-Control": "no-store",
            },
          });

        const params = new URL(request.url).searchParams;
        const code = params.get("code");
        const state = params.get("state");
        if (params.get("error") || !code || !state) return back("error");

        try {
          const [
            { supabaseAdmin },
            { hasModule },
            { encryptToken, verifyState },
            { createGoogleClient },
            { loadGoogleOAuthConfig },
          ] = await Promise.all([
            import("@/integrations/supabase/client.server"),
            import("@/lib/plans"),
            import("@/lib/google-calendar"),
            import("@/lib/google-calendar-api.server"),
            import("@/lib/google-calendar-sync.server"),
          ]);

          const cfg = await loadGoogleOAuthConfig();
          if (!cfg) return back("error");
          const st = await verifyState(state, cfg.encKey);
          if (!st) return back("error");

          const { data: biz } = await supabaseAdmin
            .from("businesses")
            .select("id,plan,owner_id,deleted_at")
            .eq("id", st.businessId)
            .maybeSingle();
          if (
            !biz ||
            biz.deleted_at ||
            biz.owner_id !== st.userId ||
            !hasModule(biz.plan, "integrations")
          )
            return back("error");

          const google = createGoogleClient();
          const tokens = await google.exchangeCode(cfg, code);
          if (!tokens.ok || !tokens.data.refresh_token) {
            if (!tokens.ok) console.error("[google-calendar] token exchange failed", tokens.error);
            return back("error");
          }
          const primary = await google.getPrimaryCalendarId(tokens.data.access_token);
          const email = primary.ok ? primary.data : "Cuenta de Google";

          // Si se conecta otra cuenta, los calendarios asignados a profesionales ya no le pertenecen.
          const { data: previous } = await supabaseAdmin
            .from("google_calendar_connections")
            .select("google_email")
            .eq("business_id", biz.id)
            .maybeSingle();
          if (previous && previous.google_email !== email)
            await supabaseAdmin
              .from("google_calendar_professional_map")
              .delete()
              .eq("business_id", biz.id);

          const { error } = await supabaseAdmin.from("google_calendar_connections").upsert(
            {
              business_id: biz.id,
              google_email: email,
              refresh_token_enc: await encryptToken(tokens.data.refresh_token, cfg.encKey),
              access_token_enc: await encryptToken(tokens.data.access_token, cfg.encKey),
              access_token_expires_at: new Date(
                Date.now() + tokens.data.expires_in * 1000,
              ).toISOString(),
              default_calendar_id: previous?.google_email === email ? undefined : "primary",
              status: "active",
              delete_events_on_disconnect: false,
              last_error: null,
              connected_by: st.userId,
              connected_at: new Date().toISOString(),
            },
            { onConflict: "business_id" },
          );
          if (error) throw new Error(error.message);

          const { error: rpcErr } = await supabaseAdmin.rpc("google_calendar_enqueue_upcoming", {
            p_business_id: biz.id,
            p_mode: "all",
          });
          if (rpcErr) console.error("[google-calendar] backfill failed", rpcErr.message);
          return back("connected");
        } catch (e) {
          console.error("[google-calendar] callback failed", e);
          return back("error");
        }
      },
    },
  },
});
