import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { hasModule } from "@/lib/plans";
import type { EmailSender } from "@/lib/email.server";
import {
  buildReminderEmail,
  isDue,
  isValidEmail,
  shouldAttempt,
  REMINDER_LOOKAHEAD_HOURS,
  REMINDER_MAX_PER_RUN,
  REMINDER_MIN_LEAD_MS,
} from "@/lib/reminders";

export type ReminderRunResult = {
  candidates: number;
  sent: number;
  failed: number;
  skipped: number;
};

type Admin = SupabaseClient<Database>;

/**
 * Envía los recordatorios por email que ya tocan. Pensado para correr cada ~15 min.
 *
 * - Solo negocios cuyo plan incluye el módulo "reminders" y que lo tienen activado.
 * - Un recordatorio por cita (UNIQUE en appointment_reminders): si dos ejecuciones se pisan,
 *   solo una "reclama" la fila y envía.
 * - Fallos: hasta 3 intentos; un "sending" colgado más de 15 min se reintenta.
 */
export async function sendDueReminders(
  admin: Admin,
  sendEmail: EmailSender,
  now = new Date(),
): Promise<ReminderRunResult> {
  const result: ReminderRunResult = { candidates: 0, sent: 0, failed: 0, skipped: 0 };

  const from = new Date(now.getTime() + REMINDER_MIN_LEAD_MS).toISOString();
  const to = new Date(now.getTime() + REMINDER_LOOKAHEAD_HOURS * 60 * 60 * 1000).toISOString();

  const { data: appts, error: apptErr } = await admin
    .from("appointments")
    .select("id, business_id, starts_at, clients(name, email), services(name)")
    .eq("status", "booked")
    .gte("starts_at", from)
    .lte("starts_at", to)
    .order("starts_at", { ascending: true })
    .limit(500);
  if (apptErr) throw new Error(apptErr.message);
  if (!appts?.length) return result;

  const businessIds = [...new Set(appts.map((a) => a.business_id))];
  const { data: businesses, error: bizErr } = await admin
    .from("businesses")
    .select("id, name, plan, phone, timezone, reminders_enabled, reminder_hours_before")
    .in("id", businessIds)
    .is("deleted_at", null);
  if (bizErr) throw new Error(bizErr.message);
  const bizById = new Map((businesses ?? []).map((b) => [b.id, b]));

  const due = appts.filter((a) => {
    const biz = bizById.get(a.business_id);
    const client = Array.isArray(a.clients) ? a.clients[0] : a.clients;
    return (
      !!biz &&
      biz.reminders_enabled &&
      hasModule(biz.plan, "reminders") &&
      isValidEmail(client?.email) &&
      isDue(new Date(a.starts_at), now, biz.reminder_hours_before)
    );
  });
  result.candidates = due.length;
  if (!due.length) return result;

  const { data: existing, error: exErr } = await admin
    .from("appointment_reminders")
    .select("id, appointment_id, status, attempts, updated_at")
    .eq("channel", "email")
    .in(
      "appointment_id",
      due.map((a) => a.id),
    );
  if (exErr) throw new Error(exErr.message);
  const existingByAppt = new Map((existing ?? []).map((r) => [r.appointment_id, r]));

  type Claim = {
    reminderId: string;
    attempts: number;
    resume: boolean;
    appt: (typeof due)[number];
  };
  const claims: Claim[] = [];

  for (const appt of due) {
    if (claims.length >= REMINDER_MAX_PER_RUN) break; // el resto sale en la siguiente ejecución
    const prev = existingByAppt.get(appt.id);
    const action = shouldAttempt(prev, now);
    if (action === "skip") {
      result.skipped++;
      continue;
    }

    if (action === "new") {
      // ignoreDuplicates: si otra ejecución insertó primero, no devuelve fila y la saltamos.
      const { data: inserted, error } = await admin
        .from("appointment_reminders")
        .upsert(
          {
            appointment_id: appt.id,
            business_id: appt.business_id,
            channel: "email",
            status: "sending",
            attempts: 1,
          },
          { onConflict: "appointment_id,channel", ignoreDuplicates: true },
        )
        .select("id")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!inserted) {
        result.skipped++;
        continue;
      }
      claims.push({ reminderId: inserted.id, attempts: 1, resume: false, appt });
    } else if (prev) {
      // Reintento: reclamo condicionado al estado y a los intentos que leímos.
      const { data: claimed, error } = await admin
        .from("appointment_reminders")
        .update({ status: "sending", attempts: prev.attempts + 1, updated_at: now.toISOString() })
        .eq("id", prev.id)
        .eq("status", prev.status)
        .eq("attempts", prev.attempts)
        .select("id")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!claimed) {
        result.skipped++;
        continue;
      }
      claims.push({
        reminderId: prev.id,
        attempts: prev.attempts + 1,
        resume: prev.status === "sending",
        appt,
      });
    }
  }

  for (const claim of claims) {
    const { appt } = claim;
    const biz = bizById.get(appt.business_id)!;
    const client = (Array.isArray(appt.clients) ? appt.clients[0] : appt.clients)!;
    const service = Array.isArray(appt.services) ? appt.services[0] : appt.services;

    try {
      const mail = buildReminderEmail({
        businessName: biz.name,
        businessPhone: biz.phone,
        clientName: client.name,
        serviceName: service?.name ?? "tu servicio",
        startsAt: new Date(appt.starts_at),
        timezone: biz.timezone,
      });
      // Si retomamos un "sending" caído, reusamos la clave para que Resend no duplique el correo.
      const idempotencyKey = claim.resume
        ? `reminder-${claim.reminderId}`
        : `reminder-${claim.reminderId}-a${claim.attempts}`;
      const { id } = await sendEmail({ to: client.email!.trim(), ...mail, idempotencyKey });
      await admin
        .from("appointment_reminders")
        .update({
          status: "sent",
          provider_id: id,
          sent_at: new Date().toISOString(),
          error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", claim.reminderId);
      result.sent++;
    } catch (e) {
      const message = (e instanceof Error ? e.message : String(e)).slice(0, 500);
      await admin
        .from("appointment_reminders")
        .update({ status: "failed", error: message, updated_at: new Date().toISOString() })
        .eq("id", claim.reminderId);
      result.failed++;
    }
  }

  return result;
}
