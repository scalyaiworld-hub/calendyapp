import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertModule } from "@/lib/api/plan-guard";
import {
  MAX_API_KEYS,
  MAX_WEBHOOKS,
  WEBHOOK_EVENTS,
  generateApiKey,
  generateWebhookSecret,
  randomToken,
  validateWebhookUrl,
} from "@/lib/integrations";

const base = z.object({ businessId: z.string().uuid() });
const eventsSchema = z.array(z.enum(WEBHOOK_EVENTS)).min(1).max(WEBHOOK_EVENTS.length);

/** Solo el dueño gestiona integraciones, y solo si su plan incluye el módulo. */
async function requireOwner(context: { supabase: any; userId: string }, businessId: string) {
  const { data, error } = await context.supabase
    .from("businesses")
    .select("id")
    .eq("id", businessId)
    .eq("owner_id", context.userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Solo el dueño puede gestionar las integraciones.");
  await assertModule(context.supabase, businessId, "integrations");
}

const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin;

export type IntegrationsOverview = {
  apiKeys: {
    id: string;
    name: string;
    prefix: string;
    createdAt: string;
    lastUsedAt: string | null;
  }[];
  webhooks: {
    id: string;
    url: string;
    events: string[];
    isActive: boolean;
    failureCount: number;
    createdAt: string;
  }[];
  deliveries: {
    id: string;
    endpointId: string;
    event: string;
    status: string;
    attempts: number;
    responseStatus: number | null;
    lastError: string | null;
    createdAt: string;
  }[];
  feedToken: string | null;
};

export const getIntegrations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => base.parse(input))
  .handler(async ({ data, context }): Promise<IntegrationsOverview> => {
    await requireOwner(context, data.businessId);
    const db = await admin();

    const { data: webhooks, error: wErr } = await db
      .from("webhook_endpoints")
      .select("id,url,events,is_active,failure_count,created_at")
      .eq("business_id", data.businessId)
      .order("created_at");
    if (wErr) throw new Error(wErr.message);
    const ids = (webhooks ?? []).map((w) => w.id);

    const [keys, feed, deliveries] = await Promise.all([
      db
        .from("api_keys")
        .select("id,name,key_prefix,created_at,last_used_at")
        .eq("business_id", data.businessId)
        .is("revoked_at", null)
        .order("created_at"),
      db.from("calendar_feeds").select("token").eq("business_id", data.businessId).maybeSingle(),
      ids.length
        ? db
            .from("webhook_deliveries")
            .select(
              "id,endpoint_id,status,attempts,response_status,last_error,created_at,webhook_events(event)",
            )
            .in("endpoint_id", ids)
            .order("created_at", { ascending: false })
            .limit(15)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (keys.error) throw new Error(keys.error.message);
    if (deliveries.error) throw new Error(deliveries.error.message);

    return {
      apiKeys: (keys.data ?? []).map((k) => ({
        id: k.id,
        name: k.name,
        prefix: k.key_prefix,
        createdAt: k.created_at,
        lastUsedAt: k.last_used_at,
      })),
      webhooks: (webhooks ?? []).map((w) => ({
        id: w.id,
        url: w.url,
        events: w.events,
        isActive: w.is_active,
        failureCount: w.failure_count,
        createdAt: w.created_at,
      })),
      deliveries: ((deliveries.data ?? []) as any[]).map((d) => ({
        id: d.id,
        endpointId: d.endpoint_id,
        event:
          (Array.isArray(d.webhook_events) ? d.webhook_events[0] : d.webhook_events)?.event ?? "—",
        status: d.status,
        attempts: d.attempts,
        responseStatus: d.response_status,
        lastError: d.last_error,
        createdAt: d.created_at,
      })),
      feedToken: feed.data?.token ?? null,
    };
  });

// ---------- Claves de API ----------
export const createApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => base.extend({ name: z.string().trim().min(1).max(60) }).parse(input))
  .handler(async ({ data, context }): Promise<{ key: string }> => {
    await requireOwner(context, data.businessId);
    const db = await admin();
    const { count } = await db
      .from("api_keys")
      .select("id", { count: "exact", head: true })
      .eq("business_id", data.businessId)
      .is("revoked_at", null);
    if ((count ?? 0) >= MAX_API_KEYS)
      throw new Error(`Máximo ${MAX_API_KEYS} claves activas. Revoca alguna para crear otra.`);

    const { key, prefix, hash } = await generateApiKey();
    const { error } = await db.from("api_keys").insert({
      business_id: data.businessId,
      name: data.name,
      key_prefix: prefix,
      key_hash: hash,
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { key }; // única vez que se devuelve la clave completa
  });

export const revokeApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => base.extend({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireOwner(context, data.businessId);
    const db = await admin();
    const { error } = await db
      .from("api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("business_id", data.businessId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// ---------- Webhooks ----------
export const createWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    base.extend({ url: z.string().trim().min(1).max(500), events: eventsSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ secret: string }> => {
    await requireOwner(context, data.businessId);
    const check = validateWebhookUrl(data.url);
    if (!check.ok) throw new Error(check.reason);
    const db = await admin();
    const { count } = await db
      .from("webhook_endpoints")
      .select("id", { count: "exact", head: true })
      .eq("business_id", data.businessId);
    if ((count ?? 0) >= MAX_WEBHOOKS)
      throw new Error(`Máximo ${MAX_WEBHOOKS} webhooks por negocio.`);

    const secret = generateWebhookSecret();
    const { error } = await db
      .from("webhook_endpoints")
      .insert({ business_id: data.businessId, url: check.url, secret, events: data.events });
    if (error) throw new Error(error.message);
    return { secret }; // única vez que se muestra el secreto de firma
  });

export const setWebhookActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    base.extend({ id: z.string().uuid(), isActive: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireOwner(context, data.businessId);
    const db = await admin();
    const { error } = await db
      .from("webhook_endpoints")
      .update({ is_active: data.isActive, ...(data.isActive ? { failure_count: 0 } : {}) })
      .eq("id", data.id)
      .eq("business_id", data.businessId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const deleteWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => base.extend({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireOwner(context, data.businessId);
    const db = await admin();
    const { error } = await db
      .from("webhook_endpoints")
      .delete()
      .eq("id", data.id)
      .eq("business_id", data.businessId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** Envía un evento de prueba firmado y devuelve el resultado al instante (no pasa por la cola). */
export const sendTestWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => base.extend({ id: z.string().uuid() }).parse(input))
  .handler(
    async ({
      data,
      context,
    }): Promise<{ ok: boolean; status: number | null; error: string | null }> => {
      await requireOwner(context, data.businessId);
      const db = await admin();
      const { data: ep, error } = await db
        .from("webhook_endpoints")
        .select("url,secret")
        .eq("id", data.id)
        .eq("business_id", data.businessId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!ep) throw new Error("Ese webhook ya no existe.");
      const { deliverToEndpoint } = await import("@/lib/webhooks.server");
      const id = crypto.randomUUID();
      return deliverToEndpoint(ep, {
        id,
        eventId: id,
        event: "webhook.test",
        createdAt: new Date().toISOString(),
        payload: { event: "webhook.test", message: "Evento de prueba de Calendya" },
      });
    },
  );

// ---------- Feed de calendario ----------
export const rotateCalendarFeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => base.parse(input))
  .handler(async ({ data, context }): Promise<{ token: string }> => {
    await requireOwner(context, data.businessId);
    const db = await admin();
    const token = randomToken(32);
    const { error } = await db
      .from("calendar_feeds")
      .upsert(
        { business_id: data.businessId, token, created_at: new Date().toISOString() },
        { onConflict: "business_id" },
      );
    if (error) throw new Error(error.message);
    return { token };
  });

export const disableCalendarFeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => base.parse(input))
  .handler(async ({ data, context }) => {
    await requireOwner(context, data.businessId);
    const db = await admin();
    const { error } = await db.from("calendar_feeds").delete().eq("business_id", data.businessId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
