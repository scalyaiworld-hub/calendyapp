import { createServerFn } from "@tanstack/react-start";
import process from "node:process";
import { z } from "zod";

const slugSchema = z.object({ slug: z.string().trim().min(1).max(120) });
const chatSchema = slugSchema.extend({
  messages: z
    .array(z.object({ role: z.string().max(20), content: z.string().max(5000) }))
    .min(1)
    .max(60),
});

/** ¿Muestra la página pública el botón del asistente? Solo si el plan lo incluye y el dueño lo activó. */
export const getChatAvailability = createServerFn({ method: "GET" })
  .inputValidator((input) => slugSchema.parse(input))
  .handler(async ({ data }): Promise<{ enabled: boolean }> => {
    const [{ supabaseAdmin }, { getChatBusiness }] = await Promise.all([
      import("@/integrations/supabase/client.server"),
      import("@/lib/ai-chat.server"),
    ]);
    return {
      enabled:
        !!process.env.ANTHROPIC_API_KEY && !!(await getChatBusiness(supabaseAdmin, data.slug)),
    };
  });

export type ChatReply =
  | {
      ok: true;
      reply: string;
      booking: { service: string; startsAt: string; date: string; time: string } | null;
    }
  | { ok: false; error: string };

/** Un mensaje del visitante. Público (sin sesión): los límites y las validaciones viven en handleChatRequest. */
export const sendChatMessage = createServerFn({ method: "POST" })
  .inputValidator((input) => chatSchema.parse(input))
  .handler(async ({ data }): Promise<ChatReply> => {
    if (!process.env.ANTHROPIC_API_KEY)
      return { ok: false, error: "El asistente no está disponible por ahora." };
    const [{ supabaseAdmin }, { handleChatRequest }, { getClientIp }, { default: Anthropic }] =
      await Promise.all([
        import("@/integrations/supabase/client.server"),
        import("@/lib/ai-chat.server"),
        import("@/lib/booking-guard.server"),
        import("@anthropic-ai/sdk"),
      ]);
    const client = new Anthropic({ maxRetries: 1, timeout: 45_000 });
    try {
      const res = await handleChatRequest({
        admin: supabaseAdmin,
        model: { create: (params) => client.beta.messages.create(params) },
        modelName: process.env.AI_CHAT_MODEL || undefined,
        slug: data.slug,
        messages: data.messages,
        ip: await getClientIp(),
      });
      return res.ok
        ? { ok: true, reply: res.reply, booking: res.booking }
        : { ok: false, error: res.error };
    } catch (e) {
      // Nunca se filtran detalles internos (claves, SQL, respuestas de la API) al visitante.
      console.error("[ai-chat] request failed", e instanceof Error ? `${e.name}: ${e.message}` : e);
      return {
        ok: false,
        error:
          "El asistente tuvo un problema. Inténtalo de nuevo en un momento o reserva desde la página.",
      };
    }
  });
