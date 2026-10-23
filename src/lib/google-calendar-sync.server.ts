import process from "node:process";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { hasModule } from "@/lib/plans";
import { MAX_DELIVERY_ATTEMPTS, webhookBackoffMs } from "@/lib/integrations";
import {
  TOKEN_REFRESH_MARGIN_MS,
  decryptToken,
  encryptToken,
  isActiveForSync,
  pickTargetCalendar,
  toGoogleEvent,
  type GoogleEventInput,
  type GoogleOAuthConfig,
} from "@/lib/google-calendar";
import {
  createGoogleClient,
  type GoogleClient,
  type GoogleResult,
} from "@/lib/google-calendar-api.server";

type Admin = SupabaseClient<Database>;

export type SyncJob = {
  id: string;
  businessId: string;
  appointmentId: string;
  action: "upsert" | "delete";
  attempts: number;
  version: number;
};
export type SyncConnection = {
  businessId: string;
  status: string;
  refreshTokenEnc: string;
  accessTokenEnc: string | null;
  accessTokenExpiresAt: string | null;
  defaultCalendarId: string;
};
export type EventLink = { calendarId: string; googleEventId: string };
export type SyncAppointment = GoogleEventInput & { professionalId: string | null };

/** Todo lo que necesita `processJob`: en producción lo arma `supabaseDeps`, en los tests se simula. */
export type SyncDeps = {
  google: GoogleClient;
  cfg: GoogleOAuthConfig;
  now: () => Date;
  loadAppointment(id: string): Promise<SyncAppointment | null>;
  professionalCalendars(businessId: string): Promise<Map<string, string>>;
  getLink(appointmentId: string): Promise<EventLink | null>;
  saveLink(appointmentId: string, businessId: string, link: EventLink): Promise<void>;
  deleteLink(appointmentId: string): Promise<void>;
  saveAccessToken(businessId: string, enc: string, expiresAt: string): Promise<void>;
};

export type JobOutcome =
  | { kind: "done" }
  | { kind: "retry"; error: string }
  | { kind: "failed"; error: string }
  | { kind: "auth_revoked"; error: string };

const RECONNECT = "Google rechazó el acceso: vuelve a conectar Google Calendar.";

function outcomeOf(res: Extract<GoogleResult<unknown>, { ok: false }>, action: string): JobOutcome {
  switch (res.reason) {
    case "auth":
      return { kind: "auth_revoked", error: RECONNECT };
    case "retryable":
      return { kind: "retry", error: res.error };
    case "forbidden":
      return { kind: "failed", error: "Sin permiso para escribir en ese calendario de Google." };
    case "not_found":
      return {
        kind: "failed",
        error:
          action === "insert"
            ? "No se encontró el calendario de Google elegido."
            : `No se encontró el evento en Google (${res.error}).`,
      };
    default:
      return { kind: "failed", error: res.error };
  }
}

/** Access token válido: reutiliza el guardado o lo refresca (y guarda el nuevo cifrado). */
export async function getAccessToken(
  conn: SyncConnection,
  deps: SyncDeps,
): Promise<{ ok: true; token: string } | { ok: false; outcome: JobOutcome }> {
  const now = deps.now().getTime();
  if (
    conn.accessTokenEnc &&
    conn.accessTokenExpiresAt &&
    new Date(conn.accessTokenExpiresAt).getTime() - now > TOKEN_REFRESH_MARGIN_MS
  ) {
    try {
      return { ok: true, token: await decryptToken(conn.accessTokenEnc, deps.cfg.encKey) };
    } catch {
      // Se refresca abajo.
    }
  }

  let refreshToken: string;
  try {
    refreshToken = await decryptToken(conn.refreshTokenEnc, deps.cfg.encKey);
  } catch {
    return {
      ok: false,
      outcome: {
        kind: "auth_revoked",
        error: "No se pudo leer la credencial guardada: vuelve a conectar Google Calendar.",
      },
    };
  }

  const res = await deps.google.refreshAccessToken(deps.cfg, refreshToken);
  if (!res.ok)
    return {
      ok: false,
      outcome:
        res.reason === "auth"
          ? { kind: "auth_revoked", error: RECONNECT }
          : { kind: "retry", error: res.error },
    };

  const expiresAt = new Date(now + res.data.expires_in * 1000).toISOString();
  await deps.saveAccessToken(
    conn.businessId,
    await encryptToken(res.data.access_token, deps.cfg.encKey),
    expiresAt,
  );
  return { ok: true, token: res.data.access_token };
}

async function deleteRemote(
  appointmentId: string,
  accessToken: string,
  deps: SyncDeps,
): Promise<JobOutcome> {
  const link = await deps.getLink(appointmentId);
  if (!link) return { kind: "done" };
  const res = await deps.google.deleteEvent(accessToken, link.calendarId, link.googleEventId);
  if (!res.ok && res.reason !== "not_found") return outcomeOf(res, "delete");
  await deps.deleteLink(appointmentId);
  return { kind: "done" };
}

/** Lleva un job a Google. No toca la cola: quien llama aplica el resultado. */
export async function processJob(
  job: SyncJob,
  conn: SyncConnection,
  accessToken: string,
  deps: SyncDeps,
): Promise<JobOutcome> {
  if (job.action === "delete") return deleteRemote(job.appointmentId, accessToken, deps);

  // Se lee el estado actual: si la cita se canceló o se borró después de encolar, se borra el evento.
  const appt = await deps.loadAppointment(job.appointmentId);
  if (!appt || !isActiveForSync(appt.status))
    return deleteRemote(job.appointmentId, accessToken, deps);

  const target = pickTargetCalendar(
    appt.professionalId,
    await deps.professionalCalendars(conn.businessId),
    conn.defaultCalendarId,
  );
  const body = toGoogleEvent(appt);
  const link = await deps.getLink(job.appointmentId);

  if (link && link.calendarId === target) {
    const res = await deps.google.patchEvent(accessToken, target, link.googleEventId, body);
    if (res.ok) {
      await deps.saveLink(job.appointmentId, conn.businessId, link);
      return { kind: "done" };
    }
    // 404/410: el usuario borró el evento en Google; se vuelve a crear.
    if (res.reason !== "not_found") return outcomeOf(res, "patch");
  } else if (link) {
    // Cambió el calendario de destino: se borra en el anterior y se crea en el nuevo.
    const res = await deps.google.deleteEvent(accessToken, link.calendarId, link.googleEventId);
    if (!res.ok && res.reason !== "not_found") return outcomeOf(res, "delete");
    await deps.deleteLink(job.appointmentId);
  }

  const res = await deps.google.insertEvent(accessToken, target, body);
  if (!res.ok) return outcomeOf(res, "insert");
  await deps.saveLink(job.appointmentId, conn.businessId, {
    calendarId: target,
    googleEventId: res.data.id,
  });
  return { kind: "done" };
}

// ============================================================
// Configuración y adaptador Supabase
// ============================================================

/** Lee la configuración de OAuth. null si falta alguna variable (la integración queda "no configurada"). */
export async function loadGoogleOAuthConfig(): Promise<GoogleOAuthConfig | null> {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const encKey = process.env.GOOGLE_TOKEN_ENC_KEY;
  if (!clientId || !clientSecret || !encKey) return null;
  const { getSiteOrigin } = await import("@/lib/email.server");
  const origin = await getSiteOrigin();
  if (!origin) return null;
  return { clientId, clientSecret, encKey, redirectUri: `${origin}/api/google-calendar/callback` };
}

export function isGoogleCalendarConfigured(): boolean {
  return !!(
    process.env.GOOGLE_OAUTH_CLIENT_ID &&
    process.env.GOOGLE_OAUTH_CLIENT_SECRET &&
    process.env.GOOGLE_TOKEN_ENC_KEY
  );
}

type ConnectionRow = Database["public"]["Tables"]["google_calendar_connections"]["Row"];

export function toSyncConnection(row: ConnectionRow): SyncConnection {
  return {
    businessId: row.business_id,
    status: row.status,
    refreshTokenEnc: row.refresh_token_enc,
    accessTokenEnc: row.access_token_enc,
    accessTokenExpiresAt: row.access_token_expires_at,
    defaultCalendarId: row.default_calendar_id,
  };
}

const must = <T extends { error: { message: string } | null }>(r: T): T => {
  if (r.error) throw new Error(r.error.message);
  return r;
};

/** Implementación real de `SyncDeps` para un negocio. */
export function supabaseDeps(
  admin: Admin,
  cfg: GoogleOAuthConfig,
  opts: { timeZone: string; google?: GoogleClient; now?: () => Date },
): SyncDeps {
  const sourceUrl = `${new URL(cfg.redirectUri).origin}/dashboard/citas`;
  let calendars: Map<string, string> | null = null;
  return {
    google: opts.google ?? createGoogleClient(),
    cfg,
    now: opts.now ?? (() => new Date()),

    async loadAppointment(id) {
      const { data } = must(
        await admin
          .from("appointments")
          .select(
            "id,status,starts_at,ends_at,notes,professional_id,clients(name,phone),services(name)",
          )
          .eq("id", id)
          .maybeSingle(),
      );
      if (!data) return null;
      let professionalName: string | null = null;
      if (data.professional_id) {
        const { data: p } = await admin
          .from("professionals")
          .select("name")
          .eq("id", data.professional_id)
          .maybeSingle();
        professionalName = p?.name ?? null;
      }
      return {
        id: data.id,
        status: data.status,
        startsAt: data.starts_at,
        endsAt: data.ends_at,
        serviceName: data.services?.name ?? null,
        clientName: data.clients?.name ?? null,
        clientPhone: data.clients?.phone ?? null,
        professionalName,
        notes: data.notes,
        timeZone: opts.timeZone,
        sourceUrl,
        professionalId: data.professional_id,
      };
    },

    async professionalCalendars(businessId) {
      if (calendars) return calendars;
      const { data } = must(
        await admin
          .from("google_calendar_professional_map")
          .select("professional_id,calendar_id")
          .eq("business_id", businessId),
      );
      calendars = new Map((data ?? []).map((m) => [m.professional_id, m.calendar_id]));
      return calendars;
    },

    async getLink(appointmentId) {
      const { data } = must(
        await admin
          .from("google_calendar_events")
          .select("calendar_id,google_event_id")
          .eq("appointment_id", appointmentId)
          .maybeSingle(),
      );
      return data ? { calendarId: data.calendar_id, googleEventId: data.google_event_id } : null;
    },

    async saveLink(appointmentId, businessId, link) {
      must(
        await admin.from("google_calendar_events").upsert(
          {
            appointment_id: appointmentId,
            business_id: businessId,
            calendar_id: link.calendarId,
            google_event_id: link.googleEventId,
            synced_at: new Date().toISOString(),
          },
          { onConflict: "appointment_id" },
        ),
      );
    },

    async deleteLink(appointmentId) {
      must(await admin.from("google_calendar_events").delete().eq("appointment_id", appointmentId));
    },

    async saveAccessToken(businessId, enc, expiresAt) {
      must(
        await admin
          .from("google_calendar_connections")
          .update({ access_token_enc: enc, access_token_expires_at: expiresAt })
          .eq("business_id", businessId),
      );
    },
  };
}

/** Marca la conexión como revocada y cierra sus jobs pendientes (no tiene sentido reintentarlos). */
export async function markConnectionRevoked(admin: Admin, businessId: string, error: string) {
  const now = new Date().toISOString();
  await admin
    .from("google_calendar_connections")
    .update({ status: "revoked", last_error: error, access_token_enc: null })
    .eq("business_id", businessId);
  await admin
    .from("google_calendar_jobs")
    .update({ status: "failed", last_error: error, locked_until: null, updated_at: now })
    .eq("business_id", businessId)
    .eq("status", "pending");
}

/** Revoca el token en Google (si se puede) y borra la conexión y el mapeo de profesionales. */
export async function removeConnection(
  admin: Admin,
  conn: SyncConnection,
  cfg: GoogleOAuthConfig | null,
  google: GoogleClient = createGoogleClient(),
) {
  if (cfg) {
    try {
      await google.revokeToken(await decryptToken(conn.refreshTokenEnc, cfg.encKey));
    } catch {
      // Si no se puede descifrar o Google no responde, igual se borra: el usuario puede quitar
      // el acceso desde myaccount.google.com.
    }
  }
  must(
    await admin
      .from("google_calendar_professional_map")
      .delete()
      .eq("business_id", conn.businessId),
  );
  must(
    await admin
      .from("google_calendar_jobs")
      .delete()
      .eq("business_id", conn.businessId)
      .eq("status", "pending"),
  );
  must(await admin.from("google_calendar_connections").delete().eq("business_id", conn.businessId));
}

// ============================================================
// Worker (lo llama el cron cada minuto)
// ============================================================

const BATCH = 50;
const LEASE_MS = 5 * 60_000;

export type GoogleSyncRunResult = {
  due: number;
  done: number;
  retried: number;
  failed: number;
  skipped: number;
  disconnected: number;
};

export async function syncDueGoogleCalendarJobs(
  admin: Admin,
  now = new Date(),
  fetchFn: typeof fetch = fetch,
): Promise<GoogleSyncRunResult> {
  const result: GoogleSyncRunResult = {
    due: 0,
    done: 0,
    retried: 0,
    failed: 0,
    skipped: 0,
    disconnected: 0,
  };
  const cfg = await loadGoogleOAuthConfig();
  if (!cfg) return result;
  const google = createGoogleClient(fetchFn);
  const nowIso = now.toISOString();

  const { data: due } = must(
    await admin
      .from("google_calendar_jobs")
      .select("id,business_id,appointment_id,action,attempts,version")
      .eq("status", "pending")
      .lte("next_attempt_at", nowIso)
      .or(`locked_until.is.null,locked_until.lt.${nowIso}`)
      .order("next_attempt_at", { ascending: true })
      .limit(BATCH),
  );
  result.due = due?.length ?? 0;

  const byBusiness = new Map<string, SyncJob[]>();
  for (const j of due ?? []) {
    const list = byBusiness.get(j.business_id) ?? [];
    list.push({
      id: j.id,
      businessId: j.business_id,
      appointmentId: j.appointment_id,
      action: j.action === "delete" ? "delete" : "upsert",
      attempts: j.attempts,
      version: j.version,
    });
    byBusiness.set(j.business_id, list);
  }

  const ids = [...byBusiness.keys()];
  const [{ data: connections }, { data: businesses }] = ids.length
    ? await Promise.all([
        admin.from("google_calendar_connections").select("*").in("business_id", ids),
        admin.from("businesses").select("id,plan,timezone,deleted_at").in("id", ids),
      ])
    : [{ data: [] }, { data: [] }];
  const connById = new Map((connections ?? []).map((c) => [c.business_id, c]));
  const bizById = new Map((businesses ?? []).map((b) => [b.id, b]));

  const closeJob = async (
    j: SyncJob,
    patch: Database["public"]["Tables"]["google_calendar_jobs"]["Update"],
  ) => {
    // Solo si la cita no cambió mientras se procesaba; si cambió, se suelta el bloqueo y se reprocesa.
    const { data } = await admin
      .from("google_calendar_jobs")
      .update({ ...patch, locked_until: null, updated_at: new Date().toISOString() })
      .eq("id", j.id)
      .eq("version", j.version)
      .select("id")
      .maybeSingle();
    if (!data)
      await admin.from("google_calendar_jobs").update({ locked_until: null }).eq("id", j.id);
  };

  for (const [businessId, jobs] of byBusiness) {
    const row = connById.get(businessId);
    const biz = bizById.get(businessId);
    if (
      !row ||
      !biz ||
      biz.deleted_at ||
      !hasModule(biz.plan, "integrations") ||
      (row.status !== "active" && row.status !== "disconnecting")
    ) {
      await admin
        .from("google_calendar_jobs")
        .update({
          status: "failed",
          last_error: "Google Calendar desconectado o plan sin integraciones",
          updated_at: nowIso,
        })
        .in(
          "id",
          jobs.map((j) => j.id),
        );
      result.skipped += jobs.length;
      continue;
    }

    const conn = toSyncConnection(row);
    const deps = supabaseDeps(admin, cfg, { timeZone: biz.timezone, google });
    const token = await getAccessToken(conn, deps);
    if (!token.ok) {
      if (token.outcome.kind === "auth_revoked") {
        await markConnectionRevoked(admin, businessId, token.outcome.error);
        result.failed += jobs.length;
      } else {
        const error = "error" in token.outcome ? token.outcome.error : "Error";
        await admin
          .from("google_calendar_connections")
          .update({ last_error: error })
          .eq("business_id", businessId);
        await admin
          .from("google_calendar_jobs")
          .update({
            next_attempt_at: new Date(now.getTime() + webhookBackoffMs(1)).toISOString(),
            last_error: error,
            updated_at: nowIso,
          })
          .in(
            "id",
            jobs.map((j) => j.id),
          );
        result.retried += jobs.length;
      }
      continue;
    }

    let lastError: string | null = null;
    let anyDone = false;
    for (const job of jobs) {
      // Reclamo con arrendamiento: si dos ejecuciones se pisan, solo una procesa este job.
      const attempts = job.attempts + 1;
      const { data: claimed } = must(
        await admin
          .from("google_calendar_jobs")
          .update({ attempts, locked_until: new Date(now.getTime() + LEASE_MS).toISOString() })
          .eq("id", job.id)
          .eq("status", "pending")
          .eq("version", job.version)
          .or(`locked_until.is.null,locked_until.lt.${nowIso}`)
          .select("id")
          .maybeSingle(),
      );
      if (!claimed) {
        result.skipped++;
        continue;
      }

      let outcome: JobOutcome;
      try {
        outcome = await processJob(job, conn, token.token, deps);
      } catch (e) {
        console.error("[google-calendar] job failed", job.id, e);
        outcome = { kind: "retry", error: "Error interno al sincronizar" };
      }

      if (outcome.kind === "done") {
        await closeJob(job, { status: "done", last_error: null, attempts });
        anyDone = true;
        result.done++;
      } else if (outcome.kind === "auth_revoked") {
        await markConnectionRevoked(admin, businessId, outcome.error);
        result.failed++;
        lastError = null; // markConnectionRevoked ya dejó el error en la conexión
        anyDone = false;
        break;
      } else if (outcome.kind === "retry" && attempts < MAX_DELIVERY_ATTEMPTS) {
        await closeJob(job, {
          last_error: outcome.error,
          attempts,
          next_attempt_at: new Date(Date.now() + webhookBackoffMs(attempts)).toISOString(),
        });
        lastError = outcome.error;
        result.retried++;
      } else {
        await closeJob(job, { status: "failed", last_error: outcome.error, attempts });
        lastError = outcome.error;
        result.failed++;
      }
    }

    if (anyDone || lastError)
      await admin
        .from("google_calendar_connections")
        .update({
          ...(anyDone ? { last_synced_at: new Date().toISOString() } : {}),
          last_error: lastError,
        })
        .eq("business_id", businessId)
        .neq("status", "revoked");
  }

  // Desconexiones con borrado: cuando ya no quedan borrados pendientes, se cierra la conexión.
  const { data: leaving } = await admin
    .from("google_calendar_connections")
    .select("*")
    .eq("status", "disconnecting");
  for (const row of leaving ?? []) {
    const { count } = await admin
      .from("google_calendar_jobs")
      .select("id", { count: "exact", head: true })
      .eq("business_id", row.business_id)
      .eq("status", "pending");
    if (count) continue;
    await removeConnection(admin, toSyncConnection(row), cfg, google);
    result.disconnected++;
  }

  return result;
}
