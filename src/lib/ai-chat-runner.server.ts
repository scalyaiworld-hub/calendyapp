import type {
  BetaContentBlockParam,
  BetaMessage,
  BetaMessageParam,
  BetaTextBlock,
  BetaTextBlockParam,
  BetaToolResultBlockParam,
  BetaToolUnion,
  MessageCreateParamsNonStreaming,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { z } from "zod";
import {
  AI_CHAT_MAX_TOKENS,
  AI_CHAT_MAX_TOOL_ROUNDS,
  CHAT_TOOLS,
  buildSystemPrompt,
  splitPhone,
  type ChatCatalog,
  type ChatMessage,
} from "@/lib/ai-chat";
import { MAX_AHEAD_DAYS, addDays, computeSlots, dayBoundsUtc, formatLocalTime, isValidYmd, todayInTz, weekdayOf, type Busy, type Window } from "@/lib/slots";
import type { BookingInput } from "@/lib/booking.server";

export type ModelClient = { create: (params: MessageCreateParamsNonStreaming) => Promise<BetaMessage> };

/** Acceso a datos que necesitan las herramientas; en producción lo implementa Supabase y en pruebas un doble. */
export interface ChatStore {
  getWindows(args: { locationId: string | null; dow: number }): Promise<Window[]>;
  getBusy(args: { from: Date; to: Date; professionalId: string | null; locationId: string | null }): Promise<Busy[]>;
  book(input: BookingInput): Promise<void>; // lanza Error con el motivo en español
}

export type ChatBooking = { service: string; startsAt: string; date: string; time: string };
export type AssistantResult = {
  reply: string;
  booking: ChatBooking | null;
  usage: { inputTokens: number; outputTokens: number };
  refused: boolean;
};

const checkSchema = z.object({
  service_id: z.string(),
  date: z.string(),
  professional_id: z.string().nullable().optional(),
  location_id: z.string().nullable().optional(),
});
const bookSchema = z.object({
  service_id: z.string(),
  starts_at: z.string(),
  customer_name: z.string(),
  customer_phone: z.string(),
  professional_id: z.string().nullable().optional(),
  location_id: z.string().nullable().optional(),
  user_confirmed: z.boolean(),
});

type ToolOutcome = { content: unknown; isError: boolean; booking?: ChatBooking };
const fail = (message: string): ToolOutcome => ({ content: { ok: false, error: message }, isError: true });

type Ctx = { catalog: ChatCatalog; store: ChatStore; now: Date; canBook: boolean; bookedAlready: boolean; businessId: string };

/** Valida que los ids que eligió el modelo existan en ESTE negocio (nunca se confía en ids ajenos). */
function resolveRefs(ctx: Ctx, input: { service_id: string; professional_id?: string | null; location_id?: string | null }) {
  const service = ctx.catalog.services.find((s) => s.id === input.service_id);
  if (!service) return { ok: false, error: "Servicio no encontrado. Usa un id del catálogo." } as const;
  let professionalId: string | null = null;
  if (input.professional_id) {
    const p = ctx.catalog.professionals.find((x) => x.id === input.professional_id);
    if (!p) return { ok: false, error: "Profesional no encontrado. Usa un id del catálogo o null." } as const;
    professionalId = p.id;
  }
  let locationId: string | null = null;
  if (input.location_id) {
    const l = ctx.catalog.locations.find((x) => x.id === input.location_id);
    if (!l) return { ok: false, error: "Sucursal no encontrada. Usa un id del catálogo o null." } as const;
    locationId = l.id;
  } else if (ctx.catalog.locations.length === 1) {
    locationId = ctx.catalog.locations[0].id; // una sola sucursal: se asigna sola
  }
  return { ok: true, service, professionalId, locationId } as const;
}

async function checkAvailability(ctx: Ctx, raw: unknown): Promise<ToolOutcome> {
  const parsed = checkSchema.safeParse(raw);
  if (!parsed.success) return fail("Parámetros inválidos.");
  const input = parsed.data;
  const refs = resolveRefs(ctx, input);
  if (!refs.ok) return fail(refs.error);

  const tz = ctx.catalog.business.timezone;
  const today = todayInTz(ctx.now, tz);
  if (!isValidYmd(input.date)) return fail("Fecha inválida: usa el formato YYYY-MM-DD.");
  if (input.date < today) return fail("Esa fecha ya pasó.");
  if (input.date > addDays(today, MAX_AHEAD_DAYS)) return fail(`Solo se puede reservar hasta ${MAX_AHEAD_DAYS} días por adelantado.`);

  const dow = weekdayOf(input.date);
  const windows = await ctx.store.getWindows({ locationId: refs.locationId, dow });
  if (windows.length === 0) return { content: { date: input.date, service: refs.service.name, slots: [], message: "El negocio no atiende ese día." }, isError: false };

  const { from, to } = dayBoundsUtc(input.date, tz);
  const busy = await ctx.store.getBusy({ from, to, professionalId: refs.professionalId, locationId: refs.locationId });
  const slots = computeSlots({ date: input.date, timezone: tz, durationMin: refs.service.duration_minutes, windows, busy, now: ctx.now });
  return {
    content: {
      date: input.date,
      service: refs.service.name,
      duration_minutes: refs.service.duration_minutes,
      slots: slots.slice(0, 24).map((s) => ({ time: s.time, starts_at: s.startsAt })),
      message: slots.length ? undefined : "No quedan horarios libres ese día.",
    },
    isError: false,
  };
}

async function createBooking(ctx: Ctx, raw: unknown): Promise<ToolOutcome> {
  const parsed = bookSchema.safeParse(raw);
  if (!parsed.success) return fail("Parámetros inválidos.");
  const input = parsed.data;
  if (input.user_confirmed !== true) return fail("Falta la confirmación explícita del cliente. Resume los datos y pídela antes de reservar.");
  if (!ctx.canBook) return fail("Se alcanzó el límite de reservas por chat. Pide al cliente que contacte directamente al negocio.");
  if (ctx.bookedAlready) return fail("Ya se creó una reserva en esta conversación. Para otra, el cliente debe escribir de nuevo.");

  const refs = resolveRefs(ctx, input);
  if (!refs.ok) return fail(refs.error);

  const start = new Date(input.starts_at);
  if (Number.isNaN(start.getTime())) return fail("starts_at inválido: usa exactamente el valor que devolvió check_availability.");
  const end = new Date(start.getTime() + refs.service.duration_minutes * 60_000);

  const name = input.customer_name.replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > 80) return fail("Nombre inválido: pide el nombre completo del cliente.");
  const phone = splitPhone(input.customer_phone, ctx.catalog.business.defaultCountryCode);
  if (!phone) return fail("Teléfono inválido: pide el número completo, con código de país si no es el del negocio.");

  try {
    await ctx.store.book({
      businessId: ctx.businessId,
      serviceId: refs.service.id,
      locationId: refs.locationId,
      professionalId: refs.professionalId,
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      name,
      phone: phone.number,
      countryCode: phone.countryCode,
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "No se pudo crear la reserva.");
  }

  const tz = ctx.catalog.business.timezone;
  const date = todayLabelFor(start, tz);
  const time = formatLocalTime(start, tz);
  return {
    content: { ok: true, message: "Reserva creada. Queda pendiente de confirmación por el negocio.", service: refs.service.name, date, time },
    isError: false,
    booking: { service: refs.service.name, startsAt: start.toISOString(), date, time },
  };
}

function todayLabelFor(d: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat("es-PE", { timeZone: tz, weekday: "long", day: "numeric", month: "long" }).format(d);
  } catch {
    return new Intl.DateTimeFormat("es-PE", { weekday: "long", day: "numeric", month: "long" }).format(d);
  }
}

export async function executeTool(ctx: Ctx, name: string, input: unknown): Promise<ToolOutcome> {
  try {
    if (name === "check_availability") return await checkAvailability(ctx, input);
    if (name === "create_booking") return await createBooking(ctx, input);
    return fail("Herramienta desconocida.");
  } catch (e) {
    console.error("[ai-chat] tool failed", name, e instanceof Error ? e.message : e);
    return fail("Error interno al ejecutar la herramienta.");
  }
}

const REFUSAL_REPLY = "Lo siento, no puedo ayudarte con eso. ¿Te ayudo con nuestros servicios o con una reserva?";
const FALLBACK_REPLY = "Perdona, no pude completar tu consulta. ¿Puedes intentarlo de nuevo o escribirnos directamente?";

export async function runAssistant(deps: {
  model: ModelClient;
  modelName: string;
  businessId: string;
  catalog: ChatCatalog;
  ownerInstructions: string | null;
  store: ChatStore;
  messages: ChatMessage[];
  canBook: boolean;
  now?: Date;
}): Promise<AssistantResult> {
  const now = deps.now ?? new Date();
  const ctx: Ctx = { catalog: deps.catalog, store: deps.store, now, canBook: deps.canBook, bookedAlready: false, businessId: deps.businessId };
  const system: BetaTextBlockParam[] = [{ type: "text", text: buildSystemPrompt(deps.catalog, deps.ownerInstructions, now), cache_control: { type: "ephemeral" } }];
  const convo: BetaMessageParam[] = deps.messages.map((m) => ({ role: m.role, content: m.content }));
  const usage = { inputTokens: 0, outputTokens: 0 };
  let booking: ChatBooking | null = null;

  for (let round = 0; round < AI_CHAT_MAX_TOOL_ROUNDS; round++) {
    const res = await deps.model.create({
      model: deps.modelName,
      max_tokens: AI_CHAT_MAX_TOKENS,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default", // si un clasificador de seguridad rechaza, la API reintenta con otro modelo
      output_config: { effort: "low" }, // es un chat: respuestas rápidas
      system,
      tools: CHAT_TOOLS as unknown as BetaToolUnion[],
      messages: convo,
    });
    usage.inputTokens += (res.usage?.input_tokens ?? 0) + (res.usage?.cache_read_input_tokens ?? 0) + (res.usage?.cache_creation_input_tokens ?? 0);
    usage.outputTokens += res.usage?.output_tokens ?? 0;

    if (res.stop_reason === "refusal") return { reply: REFUSAL_REPLY, booking, usage, refused: true };

    if (res.stop_reason === "tool_use") {
      convo.push({ role: "assistant", content: res.content as BetaContentBlockParam[] }); // incluye los bloques de pensamiento tal cual
      const results: BetaToolResultBlockParam[] = [];
      for (const block of res.content) {
        if (block.type !== "tool_use") continue;
        const out = await executeTool(ctx, block.name, block.input);
        if (out.booking) {
          booking = out.booking;
          ctx.bookedAlready = true;
        }
        results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(out.content), ...(out.isError ? { is_error: true } : {}) });
      }
      convo.push({ role: "user", content: results });
      continue;
    }

    const text = res.content
      .filter((b): b is BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return { reply: text || FALLBACK_REPLY, booking, usage, refused: false };
  }
  return { reply: FALLBACK_REPLY, booking, usage, refused: false };
}
