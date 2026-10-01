import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { hasModule } from "@/lib/plans";
import {
  DISABLE_ENDPOINT_AFTER_FAILURES,
  MAX_DELIVERY_ATTEMPTS,
  WEBHOOK_TIMEOUT_MS,
  signWebhook,
  validateWebhookUrl,
  webhookBackoffMs,
} from "@/lib/integrations";

type Admin = SupabaseClient<Database>;
type FetchFn = typeof fetch;

export type DeliveryResult = { ok: boolean; status: number | null; error: string | null };

/**
 * Hace UN envío firmado. No sigue redirecciones (un 3xx cuenta como fallo) y descarta la respuesta,
 * así un destino malicioso no puede usar el servidor para leer otros recursos.
 */
export async function deliverToEndpoint(
  endpoint: { url: string; secret: string },
  delivery: { id: string; event: string; payload: unknown; eventId: string; createdAt: string },
  fetchFn: FetchFn = fetch,
): Promise<DeliveryResult> {
  const check = validateWebhookUrl(endpoint.url); // defensa en profundidad: se revalida en cada envío
  if (!check.ok) return { ok: false, status: null, error: check.reason };

  const body = JSON.stringify({
    id: delivery.eventId,
    created_at: delivery.createdAt,
    ...(delivery.payload as object),
  });
  const timestamp = Math.floor(Date.now() / 1000);
  try {
    const res = await fetchFn(check.url, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Calendya-Webhooks/1.0",
        "X-Calendya-Event": delivery.event,
        "X-Calendya-Delivery": delivery.id,
        "X-Calendya-Timestamp": String(timestamp),
        "X-Calendya-Signature": `sha256=${await signWebhook(endpoint.secret, timestamp, body)}`,
      },
      body,
    });
    void res.body?.cancel().catch(() => {});
    if (res.status >= 200 && res.status < 300) return { ok: true, status: res.status, error: null };
    return {
      ok: false,
      status: res.status,
      error:
        res.status >= 300 && res.status < 400
          ? `Redirección ${res.status} (no se siguen)`
          : `HTTP ${res.status}`,
    };
  } catch (e) {
    const name = (e as Error)?.name;
    return {
      ok: false,
      status: null,
      error:
        name === "TimeoutError" || name === "AbortError"
          ? "Tiempo de espera agotado"
          : "No se pudo conectar",
    };
  }
}

export type WebhookRunResult = { due: number; sent: number; failed: number; skipped: number };

/** Entrega los webhooks pendientes. Pensado para correr cada minuto desde el cron. */
export async function sendDueWebhooks(
  admin: Admin,
  now = new Date(),
  fetchFn: FetchFn = fetch,
): Promise<WebhookRunResult> {
  const result: WebhookRunResult = { due: 0, sent: 0, failed: 0, skipped: 0 };

  const { data: due, error } = await admin
    .from("webhook_deliveries")
    .select("id,endpoint_id,event_id,status,attempts")
    .in("status", ["pending", "failed"])
    .lt("attempts", MAX_DELIVERY_ATTEMPTS)
    .lte("next_attempt_at", now.toISOString())
    .order("next_attempt_at", { ascending: true })
    .limit(25);
  if (error) throw new Error(error.message);
  if (!due?.length) return result;
  result.due = due.length;

  const [{ data: endpoints }, { data: events }] = await Promise.all([
    admin
      .from("webhook_endpoints")
      .select("id,business_id,url,secret,is_active,failure_count")
      .in("id", [...new Set(due.map((d) => d.endpoint_id))]),
    admin
      .from("webhook_events")
      .select("id,event,payload,created_at")
      .in("id", [...new Set(due.map((d) => d.event_id))]),
  ]);
  const endpointById = new Map((endpoints ?? []).map((e) => [e.id, e]));
  const eventById = new Map((events ?? []).map((e) => [e.id, e]));
  const { data: businesses } = await admin
    .from("businesses")
    .select("id,plan")
    .in("id", [...new Set((endpoints ?? []).map((e) => e.business_id))]);
  const planById = new Map((businesses ?? []).map((b) => [b.id, b.plan]));

  for (const d of due) {
    const endpoint = endpointById.get(d.endpoint_id);
    const event = eventById.get(d.event_id);

    // Endpoint apagado, evento perdido o negocio sin el módulo: se cierra sin reintentos.
    if (
      !endpoint ||
      !event ||
      !endpoint.is_active ||
      !hasModule(planById.get(endpoint.business_id), "integrations")
    ) {
      await admin
        .from("webhook_deliveries")
        .update({
          status: "failed",
          attempts: MAX_DELIVERY_ATTEMPTS,
          last_error: "Endpoint desactivado o plan sin integraciones",
          updated_at: now.toISOString(),
        })
        .eq("id", d.id);
      result.skipped++;
      continue;
    }

    // Reclamo con "arrendamiento" de 5 min: si dos ejecuciones se pisan, solo una gana este envío.
    const attempts = d.attempts + 1;
    const { data: claimed, error: claimErr } = await admin
      .from("webhook_deliveries")
      .update({
        attempts,
        next_attempt_at: new Date(now.getTime() + 5 * 60_000).toISOString(),
        updated_at: now.toISOString(),
      })
      .eq("id", d.id)
      .eq("attempts", d.attempts)
      .eq("status", d.status)
      .select("id")
      .maybeSingle();
    if (claimErr) throw new Error(claimErr.message);
    if (!claimed) {
      result.skipped++;
      continue;
    }

    const res = await deliverToEndpoint(
      endpoint,
      {
        id: d.id,
        event: event.event,
        payload: event.payload,
        eventId: event.id,
        createdAt: event.created_at,
      },
      fetchFn,
    );

    if (res.ok) {
      await admin
        .from("webhook_deliveries")
        .update({
          status: "sent",
          response_status: res.status,
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", d.id);
      if (endpoint.failure_count > 0)
        await admin.from("webhook_endpoints").update({ failure_count: 0 }).eq("id", endpoint.id);
      result.sent++;
    } else {
      await admin
        .from("webhook_deliveries")
        .update({
          status: "failed",
          response_status: res.status,
          last_error: res.error,
          next_attempt_at: new Date(Date.now() + webhookBackoffMs(attempts)).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", d.id);
      const failures = endpoint.failure_count + 1;
      await admin
        .from("webhook_endpoints")
        .update({
          failure_count: failures,
          ...(failures >= DISABLE_ENDPOINT_AFTER_FAILURES ? { is_active: false } : {}),
        })
        .eq("id", endpoint.id);
      endpoint.failure_count = failures;
      result.failed++;
    }
  }
  return result;
}
