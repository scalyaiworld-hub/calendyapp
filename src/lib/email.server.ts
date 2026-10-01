import process from "node:process";

// Solo servidor. En Cloudflare Workers las variables se leen por petición:
// siempre dentro de una función.

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Envía un correo con Resend. Si RESEND_API_KEY o EMAIL_FROM no están definidas no hace nada,
 * y un fallo del proveedor nunca debe romper la reserva: devuelve false y lo registra.
 */
export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      console.error("[email] Resend respondió", res.status);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[email] no se pudo enviar", e instanceof Error ? e.message : e);
    return false;
  }
}

/** Origen público de la app para armar enlaces: SITE_URL o, si no existe, el host de la petición. */
export async function getSiteOrigin(): Promise<string | null> {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, "");
  const { getRequestHeader } = await import("@tanstack/react-start/server");
  const host = getRequestHeader("host");
  return host ? `https://${host}` : null;
}

export type BookingEmailInput = {
  clientName: string;
  businessName: string;
  serviceName: string;
  locationName: string | null;
  startsAt: Date;
  timezone: string;
  manageUrl: string | null;
};

/** Correo de "recibimos tu reserva". La cita nace pendiente: el texto no promete confirmación. */
export function buildBookingReceivedEmail(i: BookingEmailInput) {
  const when = new Intl.DateTimeFormat("es-PE", {
    timeZone: i.timezone,
    dateStyle: "full",
    timeStyle: "short",
  }).format(i.startsAt);

  const subject = `Recibimos tu reserva en ${i.businessName}`;
  const lines = [
    `Hola ${i.clientName},`,
    `Recibimos tu reserva en ${i.businessName}. El negocio la revisará y la confirmará.`,
    `Servicio: ${i.serviceName}`,
    `Fecha: ${when}`,
    ...(i.locationName ? [`Sucursal: ${i.locationName}`] : []),
    ...(i.manageUrl ? [`Puedes ver o cancelar tu cita aquí: ${i.manageUrl}`] : []),
  ];
  const text = lines.join("\n\n");

  const html = `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;color:#111">
<p>Hola ${escapeHtml(i.clientName)},</p>
<p>Recibimos tu reserva en <strong>${escapeHtml(i.businessName)}</strong>. El negocio la revisará y la confirmará.</p>
<table style="border-collapse:collapse;margin:16px 0">
<tr><td style="padding:4px 12px 4px 0;color:#666">Servicio</td><td>${escapeHtml(i.serviceName)}</td></tr>
<tr><td style="padding:4px 12px 4px 0;color:#666">Fecha</td><td>${escapeHtml(when)}</td></tr>
${i.locationName ? `<tr><td style="padding:4px 12px 4px 0;color:#666">Sucursal</td><td>${escapeHtml(i.locationName)}</td></tr>` : ""}
</table>
${i.manageUrl ? `<p><a href="${escapeHtml(i.manageUrl)}">Ver o cancelar mi cita</a></p>` : ""}
</div>`;

  return { subject, html, text };
}

// ── Recordatorios (cron) ─────────────────────────────────────────────────────
// Envío con Resend (https://resend.com/docs/api-reference/emails/send-email) para los
// recordatorios de citas. A diferencia de sendEmail, aquí un fallo SÍ lanza para que el
// cron pueda reintentar. Variables (del hosting, nunca en el repositorio): RESEND_API_KEY
// y REMINDERS_FROM (p. ej. "Calendya <recordatorios@tu-dominio.com>", dominio verificado en Resend).

export type OutgoingEmail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Misma clave = Resend no duplica el envío si reintentamos. */
  idempotencyKey: string;
};

export type EmailSender = (email: OutgoingEmail) => Promise<{ id: string | null }>;

export const sendEmailOrThrow: EmailSender = async (email) => {
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
    body: JSON.stringify({
      from,
      to: [email.to],
      subject: email.subject,
      html: email.html,
      text: email.text,
    }),
  });

  if (!res.ok) {
    const body = (await res.text().catch(() => "")).slice(0, 300);
    throw new Error(`Resend ${res.status}: ${body}`);
  }
  const json = (await res.json().catch(() => ({}))) as { id?: string };
  return { id: json.id ?? null };
};
