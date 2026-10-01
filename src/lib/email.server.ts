import process from "node:process";

// Server-only. Envío de email con Resend (https://resend.com/docs/api-reference/emails/send-email).
// Variables (del hosting, nunca en el repositorio): RESEND_API_KEY y REMINDERS_FROM
// (p. ej. "Calendya <recordatorios@tu-dominio.com>", con el dominio verificado en Resend).

export type OutgoingEmail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Misma clave = Resend no duplica el envío si reintentamos. */
  idempotencyKey: string;
};

export type EmailSender = (email: OutgoingEmail) => Promise<{ id: string | null }>;

export const sendEmail: EmailSender = async (email) => {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.REMINDERS_FROM;
  if (!apiKey || !from) throw new Error("Falta configurar RESEND_API_KEY o REMINDERS_FROM");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": email.idempotencyKey,
    },
    body: JSON.stringify({ from, to: [email.to], subject: email.subject, html: email.html, text: email.text }),
  });

  if (!res.ok) {
    const body = (await res.text().catch(() => "")).slice(0, 300);
    throw new Error(`Resend ${res.status}: ${body}`);
  }
  const json = (await res.json().catch(() => ({}))) as { id?: string };
  return { id: json.id ?? null };
};
