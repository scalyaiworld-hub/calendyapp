import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { hasModule } from "@/lib/plans";
import { settingsFromBusiness } from "@/lib/availability-core";
import {
  AI_CHAT_BOOKINGS_PER_IP_DAY,
  AI_CHAT_BUSINESS_HOURLY,
  AI_CHAT_BUSINESS_MONTHLY,
  AI_CHAT_DEFAULT_MODEL,
  AI_CHAT_IP_LIMIT,
  sanitizeMessages,
  type ChatCatalog,
} from "@/lib/ai-chat";
import { loadBookingContext, slotsFromContext } from "@/lib/booking.server";
import {
  prepareBooking,
  submitPublicBooking,
  type BookingSubmission,
} from "@/lib/public-booking.server";
import {
  runAssistant,
  type ChatBooking,
  type ChatStore,
  type ModelClient,
} from "@/lib/ai-chat-runner.server";

type Admin = SupabaseClient<Database>;

const DEFAULT_TZ = "America/Lima";

export type ChatBusiness = {
  id: string;
  name: string;
  industry: string | null;
  phone: string | null;
  timezone: string;
  whatsapp_country_code: string | null;
  ai_chat_instructions: string | null;
  booking_min_lead_minutes: number | null;
  booking_max_ahead_days: number | null;
};

/** Negocio con el chat disponible: existe, su plan incluye el módulo y el dueño lo activó. */
export async function getChatBusiness(admin: Admin, slug: string): Promise<ChatBusiness | null> {
  const { data } = await admin
    .from("businesses")
    .select(
      "id,name,industry,phone,timezone,whatsapp_country_code,plan,ai_chat_enabled,ai_chat_instructions,booking_min_lead_minutes,booking_max_ahead_days",
    )
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data || !data.ai_chat_enabled || !hasModule(data.plan, "aiChat")) return null;
  const { plan: _plan, ai_chat_enabled: _enabled, ...biz } = data;
  return biz;
}

export async function loadCatalog(admin: Admin, biz: ChatBusiness): Promise<ChatCatalog> {
  const [services, pros, locations, hours] = await Promise.all([
    admin
      .from("services")
      .select("id,name,duration_minutes,price_cents,description")
      .eq("business_id", biz.id)
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("display_order"),
    admin
      .from("professionals")
      .select("id,name")
      .eq("business_id", biz.id)
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("name"),
    admin
      .from("locations")
      .select("id,name,address")
      .eq("business_id", biz.id)
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("created_at"),
    admin
      .from("availability_rules")
      .select("day_of_week,start_time,end_time")
      .eq("business_id", biz.id),
  ]);
  for (const r of [services, pros, locations, hours]) if (r.error) throw new Error(r.error.message);

  // Solo las asignaciones de ESTE negocio (professional_services no tiene business_id: se filtra por sus profesionales).
  const proIds = (pros.data ?? []).map((p) => p.id);
  let assignments: { professional_id: string; service_id: string }[] = [];
  if (proIds.length) {
    const { data, error } = await admin
      .from("professional_services")
      .select("professional_id,service_id")
      .in("professional_id", proIds);
    if (error) throw new Error(error.message);
    assignments = data ?? [];
  }

  const rules = settingsFromBusiness(biz);
  return {
    business: {
      name: biz.name,
      industry: biz.industry,
      phone: biz.phone,
      timezone: biz.timezone || DEFAULT_TZ,
      defaultCountryCode: biz.whatsapp_country_code || "+51",
      minLeadMinutes: rules.minLeadMinutes,
      maxAheadDays: rules.maxAheadDays,
    },
    services: services.data ?? [],
    professionals: (pros.data ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      serviceIds: assignments.filter((a) => a.professional_id === p.id).map((a) => a.service_id),
    })),
    locations: locations.data ?? [],
    hours: hours.data ?? [],
  };
}

/**
 * Las herramientas del chat usan EXACTAMENTE el mismo flujo que la página pública de reservas:
 * `loadBookingContext` + `slotsFromContext` para los horarios y `submitPublicBooking` para crear la
 * cita. Así heredan todas las reglas del negocio (anticipación, buffers, cierres, turnos partidos,
 * profesional y sucursal obligatorios, política de no-shows, cupos y límites anti-abuso).
 */
export function makeSupabaseStore(admin: Admin, businessId: string, ip: string): ChatStore {
  return {
    async getSlots({ serviceId, locationId, professionalId, date }) {
      const ctx = await loadBookingContext(admin, {
        businessId,
        serviceId,
        locationId,
        professionalId,
        date,
      });
      return { closed: ctx.closed, slots: ctx.closed ? [] : slotsFromContext(ctx, date) };
    },
    async book(i) {
      const input: BookingSubmission = {
        businessId,
        serviceId: i.serviceId,
        locationId: i.locationId,
        professionalId: i.professionalId,
        startsAt: i.startsAt,
        endsAt: i.endsAt,
        name: i.name,
        phone: i.phone,
        countryCode: i.countryCode,
        email: i.email ?? undefined,
      };
      await submitPublicBooking(admin, input, prepareBooking(input), { source: "chat_ai", ip });
    },
  };
}

export type LimitCheck =
  { ok: true } | { ok: false; reason: "ip" | "hourly" | "monthly"; message: string };

const count = async (
  admin: Admin,
  businessId: string,
  since: Date,
  ipHash?: string,
  bookedOnly = false,
) => {
  let q = admin
    .from("ai_chat_usage")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .gte("created_at", since.toISOString());
  if (ipHash) q = q.eq("ip_hash", ipHash);
  if (bookedOnly) q = q.eq("booked", true);
  const { count: n, error } = await q;
  if (error) throw new Error(error.message);
  return n ?? 0;
};

/** Límites que acotan el costo de un endpoint público: por visitante, por hora y por mes del negocio. */
export async function checkChatLimits(
  admin: Admin,
  businessId: string,
  ipHash: string,
  now = new Date(),
): Promise<LimitCheck & { canBook: boolean }> {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [ip, hourly, monthly, booked] = await Promise.all([
    count(admin, businessId, new Date(now.getTime() - AI_CHAT_IP_LIMIT.windowMs), ipHash),
    count(admin, businessId, new Date(now.getTime() - 3600_000)),
    count(admin, businessId, monthStart),
    count(admin, businessId, new Date(now.getTime() - 86_400_000), ipHash, true),
  ]);
  const canBook = booked < AI_CHAT_BOOKINGS_PER_IP_DAY;
  if (ip >= AI_CHAT_IP_LIMIT.count)
    return {
      ok: false,
      reason: "ip",
      canBook,
      message: "Enviaste muchos mensajes seguidos. Espera unos minutos e inténtalo de nuevo.",
    };
  if (hourly >= AI_CHAT_BUSINESS_HOURLY)
    return {
      ok: false,
      reason: "hourly",
      canBook,
      message:
        "El asistente está muy concurrido ahora. Intenta de nuevo en un rato o reserva desde la página.",
    };
  if (monthly >= AI_CHAT_BUSINESS_MONTHLY)
    return {
      ok: false,
      reason: "monthly",
      canBook,
      message: "El asistente no está disponible por ahora. Puedes reservar desde la página.",
    };
  return { ok: true, canBook };
}

/** Hash del visitante (IP + negocio): sirve para limitar abuso sin guardar la IP. */
export async function hashVisitor(ip: string, businessId: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${businessId}:${ip}`),
  );
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type ChatResponse =
  | { ok: true; reply: string; booking: ChatBooking | null }
  | { ok: false; error: string; status: "invalid" | "limit" | "unavailable" };

/** Flujo completo de un mensaje: valida, aplica límites, registra el uso, llama a Claude y guarda los tokens. */
export async function handleChatRequest(deps: {
  admin: Admin;
  model: ModelClient;
  modelName?: string;
  slug: string;
  messages: unknown;
  ip: string;
  now?: Date;
}): Promise<ChatResponse> {
  const { admin } = deps;
  const clean = sanitizeMessages(deps.messages);
  if (!clean.ok) return { ok: false, error: clean.error, status: "invalid" };

  const biz = await getChatBusiness(admin, deps.slug);
  if (!biz)
    return {
      ok: false,
      error: "El asistente no está disponible en este negocio.",
      status: "unavailable",
    };

  const ipHash = await hashVisitor(deps.ip, biz.id);
  const limits = await checkChatLimits(admin, biz.id, ipHash, deps.now);
  if (!limits.ok) return { ok: false, error: limits.message, status: "limit" };

  // El uso se registra ANTES de llamar al modelo: una llamada que falla o se alarga también cuenta contra el límite.
  const { data: usageRow, error: usageErr } = await admin
    .from("ai_chat_usage")
    .insert({ business_id: biz.id, ip_hash: ipHash })
    .select("id")
    .single();
  if (usageErr) throw new Error(usageErr.message);

  const catalog = await loadCatalog(admin, biz);
  const result = await runAssistant({
    model: deps.model,
    modelName: deps.modelName ?? AI_CHAT_DEFAULT_MODEL,
    catalog,
    ownerInstructions: biz.ai_chat_instructions,
    store: makeSupabaseStore(admin, biz.id, deps.ip),
    messages: clean.messages,
    canBook: limits.canBook,
    now: deps.now,
  });

  await admin
    .from("ai_chat_usage")
    .update({
      input_tokens: result.usage.inputTokens,
      output_tokens: result.usage.outputTokens,
      booked: !!result.booking,
    })
    .eq("id", usageRow.id);

  return { ok: true, reply: result.reply, booking: result.booking };
}
