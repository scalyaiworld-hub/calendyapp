import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarCheck, MessageCircle, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getChatAvailability, sendChatMessage } from "@/lib/api/ai-chat.functions";
import { AI_CHAT_MAX_CHARS, AI_CHAT_MAX_MESSAGES } from "@/lib/ai-chat";

type Msg = { role: "user" | "assistant"; content: string; error?: boolean; booking?: { service: string; date: string; time: string } };

const GREETING = "¡Hola! Soy el asistente virtual. Puedo contarte sobre servicios y precios, revisar horarios libres y reservar tu cita. ¿En qué te ayudo?";

/**
 * Chat con IA de la página pública. Solo aparece si el plan del negocio lo incluye y el dueño lo activó.
 * El texto de la IA se pinta como texto plano (nunca como HTML) para que no pueda inyectar nada en la página.
 */
export function AiChatWidget({ slug }: { slug: string }) {
  const availability = useQuery({
    queryKey: ["ai-chat-availability", slug],
    queryFn: () => getChatAvailability({ data: { slug } }),
    staleTime: 5 * 60_000,
  });

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([{ role: "assistant", content: GREETING }]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, busy, open]);
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!availability.data?.enabled) return null;

  const send = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setDraft("");
    setBusy(true);
    try {
      // Al servidor solo van los mensajes de la conversación (sin el saludo ni los errores locales).
      const history = next.filter((m) => !m.error).slice(1).slice(-AI_CHAT_MAX_MESSAGES).map(({ role, content }) => ({ role, content }));
      const res = await sendChatMessage({ data: { slug, messages: history } });
      setMessages((cur) => [
        ...cur,
        res.ok ? { role: "assistant", content: res.reply, booking: res.booking ?? undefined } : { role: "assistant", content: res.error, error: true },
      ]);
    } catch {
      setMessages((cur) => [...cur, { role: "assistant", content: "No pudimos conectar con el asistente. Revisa tu conexión e inténtalo de nuevo.", error: true }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Abrir el asistente virtual"
          aria-expanded={false}
          className="fixed bottom-5 right-5 z-50 inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-4 py-3 shadow-lg hover:opacity-95 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <MessageCircle className="size-5" aria-hidden />
          <span className="text-sm font-medium">¿Dudas? Pregúntame</span>
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-label="Asistente virtual"
          onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
          className="fixed z-50 bottom-0 right-0 sm:bottom-5 sm:right-5 w-full sm:w-[380px] h-[85dvh] sm:h-[560px] flex flex-col rounded-t-2xl sm:rounded-2xl border border-border bg-background shadow-2xl"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div>
              <p className="text-sm font-semibold">Asistente virtual</p>
              <p className="text-[11px] text-muted-foreground">Respuestas generadas con IA</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar el asistente" className="p-1.5 rounded-md hover:bg-accent text-muted-foreground">
              <X className="size-4" />
            </button>
          </div>

          <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3" aria-live="polite" aria-busy={busy}>
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={
                    m.role === "user"
                      ? "max-w-[85%] rounded-2xl rounded-br-sm bg-primary text-primary-foreground px-3 py-2 text-sm whitespace-pre-wrap break-words"
                      : m.error
                        ? "max-w-[85%] rounded-2xl rounded-bl-sm border border-destructive/40 text-destructive px-3 py-2 text-sm whitespace-pre-wrap break-words"
                        : "max-w-[85%] rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-sm whitespace-pre-wrap break-words"
                  }
                >
                  {m.content}
                  {m.booking && (
                    <p className="mt-2 flex items-center gap-1.5 text-xs font-medium">
                      <CalendarCheck className="size-3.5" aria-hidden /> {m.booking.service} · {m.booking.date}, {m.booking.time}
                    </p>
                  )}
                </div>
              </div>
            ))}
            {busy && <p className="text-xs text-muted-foreground">Escribiendo…</p>}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
            className="border-t border-border p-3 space-y-2"
          >
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                rows={1}
                maxLength={AI_CHAT_MAX_CHARS}
                placeholder="Escribe tu mensaje…"
                aria-label="Tu mensaje"
                className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm max-h-28 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <Button type="submit" size="icon" disabled={busy || !draft.trim()} aria-label="Enviar mensaje">
                <Send className="size-4" />
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">La IA puede equivocarse: el negocio confirmará tu reserva. No compartas datos sensibles.</p>
          </form>
        </div>
      )}
    </>
  );
}
