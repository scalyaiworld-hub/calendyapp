// Lógica pura de los recordatorios (sin red ni base de datos) para poder probarla.

export const REMINDER_MIN_LEAD_MS = 60 * 60 * 1000; // no avisar de citas que empiezan en menos de 1 h
export const REMINDER_MAX_ATTEMPTS = 3;
export const REMINDER_STALE_SENDING_MS = 15 * 60 * 1000; // un "sending" más viejo se considera caído
export const REMINDER_MAX_PER_RUN = 40; // tope de envíos por ejecución del cron
export const REMINDER_LOOKAHEAD_HOURS = 72; // máximo configurable por negocio
export const DEFAULT_TIMEZONE = "America/Lima";

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

export function isValidEmail(email: string | null | undefined): email is string {
  return !!email && email.length <= 254 && EMAIL_RE.test(email.trim());
}

/** ¿La cita cae dentro de la ventana del recordatorio (entre 1 h y `hoursBefore` h)? */
export function isDue(startsAt: Date, now: Date, hoursBefore: number): boolean {
  const lead = startsAt.getTime() - now.getTime();
  return lead >= REMINDER_MIN_LEAD_MS && lead <= hoursBefore * 60 * 60 * 1000;
}

export type ExistingReminder = { status: string; attempts: number; updated_at: string } | undefined;

/** Decide si hay que (re)enviar según el registro previo del recordatorio. */
export function shouldAttempt(existing: ExistingReminder, now: Date): "new" | "retry" | "skip" {
  if (!existing) return "new";
  if (existing.status === "sent" || existing.attempts >= REMINDER_MAX_ATTEMPTS) return "skip";
  if (existing.status === "failed") return "retry";
  if (existing.status === "sending") {
    const age = now.getTime() - new Date(existing.updated_at).getTime();
    return age >= REMINDER_STALE_SENDING_MS ? "retry" : "skip";
  }
  return "skip";
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const stripControl = (s: string) => s.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();

export function formatInTimezone(date: Date, timezone: string): { day: string; time: string } {
  const make = (tz: string) => ({
    day: new Intl.DateTimeFormat("es-PE", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: tz,
    }).format(date),
    time: new Intl.DateTimeFormat("es-PE", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: tz,
    }).format(date),
  });
  try {
    return make(timezone);
  } catch {
    return make(DEFAULT_TIMEZONE); // zona horaria inválida guardada en la base
  }
}

export type ReminderEmailInput = {
  businessName: string;
  businessPhone?: string | null;
  clientName: string;
  serviceName: string;
  startsAt: Date;
  timezone: string;
};

export function buildReminderEmail(input: ReminderEmailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const business = stripControl(input.businessName);
  const client = stripControl(input.clientName);
  const service = stripControl(input.serviceName);
  const phone = input.businessPhone ? stripControl(input.businessPhone) : null;
  const { day, time } = formatInTimezone(input.startsAt, input.timezone);

  const subject = `Recordatorio: tu cita en ${business} es ${day} a las ${time}`;
  const text = [
    `Hola ${client},`,
    "",
    `Te recordamos tu cita en ${business}:`,
    `Servicio: ${service}`,
    `Fecha: ${day}`,
    `Hora: ${time}`,
    "",
    phone
      ? `Si necesitas reprogramar o cancelar, contáctanos: ${phone}.`
      : "Si necesitas reprogramar o cancelar, contáctanos con anticipación.",
    "",
    `— ${business}`,
  ].join("\n");

  const html = `<!doctype html>
<html lang="es"><body style="margin:0;padding:24px;background:#f6f6f7;font-family:Arial,Helvetica,sans-serif;color:#18181b;">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px;">
    <p style="margin:0 0 16px;font-size:16px;">Hola ${escapeHtml(client)},</p>
    <p style="margin:0 0 20px;font-size:15px;">Te recordamos tu cita en <strong>${escapeHtml(business)}</strong>:</p>
    <table role="presentation" style="width:100%;border-collapse:collapse;font-size:15px;">
      <tr><td style="padding:6px 0;color:#71717a;">Servicio</td><td style="padding:6px 0;text-align:right;"><strong>${escapeHtml(service)}</strong></td></tr>
      <tr><td style="padding:6px 0;color:#71717a;">Fecha</td><td style="padding:6px 0;text-align:right;"><strong>${escapeHtml(day)}</strong></td></tr>
      <tr><td style="padding:6px 0;color:#71717a;">Hora</td><td style="padding:6px 0;text-align:right;"><strong>${escapeHtml(time)}</strong></td></tr>
    </table>
    <p style="margin:24px 0 0;font-size:13px;color:#71717a;">${
      phone
        ? `Si necesitas reprogramar o cancelar, contáctanos: ${escapeHtml(phone)}.`
        : "Si necesitas reprogramar o cancelar, contáctanos con anticipación."
    }</p>
  </div>
</body></html>`;

  return { subject, html, text };
}
