import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { settingsFromBusiness } from "@/lib/availability-core";

const tokenSchema = z.object({ token: z.string().uuid() });

export type ManagedBooking =
  | { found: false }
  | {
      found: true;
      businessName: string;
      businessSlug: string;
      timezone: string;
      serviceName: string;
      durationMinutes: number;
      professionalName: string | null;
      locationName: string | null;
      startsAt: string;
      endsAt: string;
      status: string;
      cancelledReason: string | null;
      canCancel: boolean;
      /** Instante límite para cancelar en línea. */
      cancelDeadline: string;
      cancelMinHours: number;
    };

async function loadByToken(token: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: appt } = await supabaseAdmin
    .from("appointments")
    .select("id,business_id,service_id,professional_id,location_id,starts_at,ends_at,status,cancelled_reason")
    .eq("manage_token", token)
    .maybeSingle();
  if (!appt) return null;

  const [biz, svc, pro, loc] = await Promise.all([
    supabaseAdmin
      .from("businesses")
      .select("name,slug,timezone,booking_cancel_min_hours,booking_min_lead_minutes,booking_max_ahead_days,booking_slot_step_minutes,booking_buffer_minutes,booking_max_no_shows")
      .eq("id", appt.business_id)
      .maybeSingle(),
    supabaseAdmin.from("services").select("name,duration_minutes").eq("id", appt.service_id).maybeSingle(),
    appt.professional_id
      ? supabaseAdmin.from("professionals").select("name").eq("id", appt.professional_id).maybeSingle()
      : Promise.resolve({ data: null }),
    appt.location_id
      ? supabaseAdmin.from("locations").select("name").eq("id", appt.location_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (!biz.data) return null;
  return { appt, biz: biz.data, svc: svc.data, pro: pro.data, loc: loc.data };
}

function cancelState(appt: { status: string; starts_at: string }, cancelMinHours: number) {
  const deadline = new Date(new Date(appt.starts_at).getTime() - cancelMinHours * 3_600_000);
  const open = appt.status === "pending" || appt.status === "booked";
  return { deadline, canCancel: open && Date.now() <= deadline.getTime() };
}

/** Datos mínimos de la cita para el enlace de gestión del cliente. No expone teléfono ni notas. */
export const getBookingByToken = createServerFn({ method: "POST" })
  .inputValidator((input) => tokenSchema.parse(input))
  .handler(async ({ data }): Promise<ManagedBooking> => {
    const row = await loadByToken(data.token);
    if (!row) return { found: false };
    const { appt, biz, svc, pro, loc } = row;
    const cfg = settingsFromBusiness(biz);
    const { deadline, canCancel } = cancelState(appt, cfg.cancelMinHours);
    return {
      found: true,
      businessName: biz.name,
      businessSlug: biz.slug,
      timezone: biz.timezone ?? "America/Lima",
      serviceName: svc?.name ?? "Servicio",
      durationMinutes: svc?.duration_minutes ?? 0,
      professionalName: pro?.name ?? null,
      locationName: loc?.name ?? null,
      startsAt: appt.starts_at,
      endsAt: appt.ends_at,
      status: appt.status,
      cancelledReason: appt.cancelled_reason,
      canCancel,
      cancelDeadline: deadline.toISOString(),
      cancelMinHours: cfg.cancelMinHours,
    };
  });

/** El cliente cancela su propia cita respetando la anticipación mínima que fijó el negocio. */
export const cancelBookingByToken = createServerFn({ method: "POST" })
  .inputValidator((input) => tokenSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { BookingError } = await import("@/lib/booking.server");
    const row = await loadByToken(data.token);
    if (!row) throw new BookingError("No encontramos esta reserva");
    const { appt, biz } = row;

    if (appt.status !== "pending" && appt.status !== "booked") {
      throw new BookingError("Esta reserva ya no se puede cancelar");
    }
    const cfg = settingsFromBusiness(biz);
    const { canCancel } = cancelState(appt, cfg.cancelMinHours);
    if (!canCancel) {
      throw new BookingError(
        `Ya no es posible cancelar en línea (se permite hasta ${cfg.cancelMinHours} h antes). Contacta directamente al negocio`,
      );
    }

    const { error } = await supabaseAdmin
      .from("appointments")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancelled_reason: "Cancelada por el cliente" })
      .eq("id", appt.id)
      .in("status", ["pending", "booked"]);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
