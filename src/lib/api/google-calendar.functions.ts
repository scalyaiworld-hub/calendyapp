import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOwner } from "@/lib/api/owner-guard";
import type { GoogleCalendarItem } from "@/lib/google-calendar-api.server";

// Sincronización Calendya → Google Calendar. Las tablas son solo de servidor: todo pasa por aquí
// con el cliente admin, después de comprobar dueño + plan.

const base = z.object({ businessId: z.string().uuid() });
const calendarId = z.string().trim().min(1).max(300);

const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin;
const sync = () => import("@/lib/google-calendar-sync.server");

export type GoogleConnectionStatus = "active" | "revoked" | "error" | "disconnecting";

export type GoogleCalendarStatus = {
  configured: boolean;
  connection: null | {
    email: string;
    status: GoogleConnectionStatus;
    defaultCalendarId: string;
    lastSyncedAt: string | null;
    lastError: string | null;
    connectedAt: string;
  };
  professionals: { id: string; name: string; calendarId: string | null }[];
  pendingJobs: number;
  failedJobs: number;
};

export const getGoogleCalendarStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => base.parse(input))
  .handler(async ({ data, context }): Promise<GoogleCalendarStatus> => {
    await requireOwner(context, data.businessId);
    const db = await admin();
    const { isGoogleCalendarConfigured } = await sync();
    // Sin configurar no se consultan las tablas: así desplegar antes de aplicar la migración no rompe la página.
    if (!isGoogleCalendarConfigured())
      return {
        configured: false,
        connection: null,
        professionals: [],
        pendingJobs: 0,
        failedJobs: 0,
      };
    const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();

    const [conn, pros, map, pending, failed] = await Promise.all([
      db
        .from("google_calendar_connections")
        .select("google_email,status,default_calendar_id,last_synced_at,last_error,connected_at")
        .eq("business_id", data.businessId)
        .maybeSingle(),
      db
        .from("professionals")
        .select("id,name")
        .eq("business_id", data.businessId)
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("name"),
      db
        .from("google_calendar_professional_map")
        .select("professional_id,calendar_id")
        .eq("business_id", data.businessId),
      db
        .from("google_calendar_jobs")
        .select("id", { count: "exact", head: true })
        .eq("business_id", data.businessId)
        .eq("status", "pending"),
      db
        .from("google_calendar_jobs")
        .select("id", { count: "exact", head: true })
        .eq("business_id", data.businessId)
        .eq("status", "failed")
        .gte("updated_at", weekAgo),
    ]);
    if (conn.error) throw new Error(conn.error.message);
    if (pros.error) throw new Error(pros.error.message);
    const byPro = new Map((map.data ?? []).map((m) => [m.professional_id, m.calendar_id]));

    return {
      configured: isGoogleCalendarConfigured(),
      connection: conn.data
        ? {
            email: conn.data.google_email,
            status: conn.data.status as GoogleConnectionStatus,
            defaultCalendarId: conn.data.default_calendar_id,
            lastSyncedAt: conn.data.last_synced_at,
            lastError: conn.data.last_error,
            connectedAt: conn.data.connected_at,
          }
        : null,
      professionals: (pros.data ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        calendarId: byPro.get(p.id) ?? null,
      })),
      pendingJobs: pending.count ?? 0,
      failedJobs: failed.count ?? 0,
    };
  });

export const startGoogleCalendarConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => base.parse(input))
  .handler(async ({ data, context }): Promise<{ url: string }> => {
    await requireOwner(context, data.businessId);
    const cfg = await (await sync()).loadGoogleOAuthConfig();
    if (!cfg)
      throw new Error("La conexión con Google Calendar no está configurada en el servidor.");
    const { buildAuthUrl, signState } = await import("@/lib/google-calendar");
    const state = await signState(
      { businessId: data.businessId, userId: context.userId },
      cfg.encKey,
    );
    return { url: buildAuthUrl(cfg, state) };
  });

/** Calendarios en los que la cuenta conectada puede escribir. */
async function writableCalendars(businessId: string): Promise<GoogleCalendarItem[]> {
  const db = await admin();
  const {
    loadGoogleOAuthConfig,
    getAccessToken,
    markConnectionRevoked,
    supabaseDeps,
    toSyncConnection,
  } = await sync();
  const cfg = await loadGoogleOAuthConfig();
  if (!cfg) throw new Error("La conexión con Google Calendar no está configurada en el servidor.");
  const { data: row, error } = await db
    .from("google_calendar_connections")
    .select("*")
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row || row.status !== "active") throw new Error("Google Calendar no está conectado.");

  const deps = supabaseDeps(db, cfg, { timeZone: "UTC" });
  const token = await getAccessToken(toSyncConnection(row), deps);
  if (!token.ok) {
    if (token.outcome.kind === "auth_revoked") {
      await markConnectionRevoked(db, businessId, token.outcome.error);
    }
    throw new Error(
      "error" in token.outcome ? token.outcome.error : "No se pudo conectar con Google.",
    );
  }
  const res = await deps.google.listWritableCalendars(token.token);
  if (!res.ok) {
    if (res.reason === "auth") {
      await markConnectionRevoked(
        db,
        businessId,
        "Google rechazó el acceso: vuelve a conectar Google Calendar.",
      );
    }
    throw new Error("No se pudo leer la lista de calendarios de Google.");
  }
  return res.data;
}

async function assertWritable(businessId: string, id: string) {
  const calendars = await writableCalendars(businessId);
  // "primary" es el alias del calendario principal de la cuenta.
  if (id !== "primary" && !calendars.some((c) => c.id === id))
    throw new Error("Ese calendario no existe o la cuenta no puede escribir en él.");
}

export const listGoogleCalendars = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => base.parse(input))
  .handler(async ({ data, context }): Promise<GoogleCalendarItem[]> => {
    await requireOwner(context, data.businessId);
    return writableCalendars(data.businessId);
  });

export const setDefaultCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => base.extend({ calendarId }).parse(input))
  .handler(async ({ data, context }) => {
    await requireOwner(context, data.businessId);
    await assertWritable(data.businessId, data.calendarId);
    const db = await admin();
    const { error } = await db
      .from("google_calendar_connections")
      .update({ default_calendar_id: data.calendarId })
      .eq("business_id", data.businessId);
    if (error) throw new Error(error.message);
    // Las citas próximas que van al calendario por defecto se mueven al nuevo.
    const { error: rpcErr } = await db.rpc("google_calendar_enqueue_upcoming", {
      p_business_id: data.businessId,
      p_mode: "default",
    });
    if (rpcErr) throw new Error(rpcErr.message);
    return { ok: true as const };
  });

export const setProfessionalCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    base
      .extend({ professionalId: z.string().uuid(), calendarId: calendarId.nullable() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireOwner(context, data.businessId);
    const db = await admin();
    const { data: pro, error: pErr } = await db
      .from("professionals")
      .select("id")
      .eq("id", data.professionalId)
      .eq("business_id", data.businessId)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!pro) throw new Error("Profesional no encontrado.");

    if (data.calendarId === null) {
      const { error } = await db
        .from("google_calendar_professional_map")
        .delete()
        .eq("professional_id", data.professionalId);
      if (error) throw new Error(error.message);
    } else {
      await assertWritable(data.businessId, data.calendarId);
      const { error } = await db.from("google_calendar_professional_map").upsert(
        {
          professional_id: data.professionalId,
          business_id: data.businessId,
          calendar_id: data.calendarId,
        },
        { onConflict: "professional_id" },
      );
      if (error) throw new Error(error.message);
    }
    const { error: rpcErr } = await db.rpc("google_calendar_enqueue_upcoming", {
      p_business_id: data.businessId,
      p_mode: "professional",
      p_professional_id: data.professionalId,
    });
    if (rpcErr) throw new Error(rpcErr.message);
    return { ok: true as const };
  });

export const disconnectGoogleCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => base.extend({ deleteEvents: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireOwner(context, data.businessId);
    const db = await admin();
    const { loadGoogleOAuthConfig, removeConnection, toSyncConnection } = await sync();
    const { data: row, error } = await db
      .from("google_calendar_connections")
      .select("*")
      .eq("business_id", data.businessId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return { ok: true as const };

    if (data.deleteEvents && row.status !== "revoked") {
      // El worker borra los eventos y, al terminar, revoca el acceso y elimina la conexión.
      const { error: uErr } = await db
        .from("google_calendar_connections")
        .update({ status: "disconnecting", delete_events_on_disconnect: true })
        .eq("business_id", data.businessId);
      if (uErr) throw new Error(uErr.message);
      await db
        .from("google_calendar_jobs")
        .delete()
        .eq("business_id", data.businessId)
        .eq("status", "pending");
      const { data: queued, error: rpcErr } = await db.rpc("google_calendar_enqueue_delete_all", {
        p_business_id: data.businessId,
      });
      if (rpcErr) throw new Error(rpcErr.message);
      if (queued) return { ok: true as const };
    }

    await removeConnection(db, toSyncConnection(row), await loadGoogleOAuthConfig());
    return { ok: true as const };
  });
