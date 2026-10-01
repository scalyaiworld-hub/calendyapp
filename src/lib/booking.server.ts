import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeSlots,
  dayOfWeekOfYmd,
  settingsFromBusiness,
  type BookingSettings,
  type BusyRange,
  type HourWindow,
} from "@/lib/availability-core";
import { dayBoundsOfYmd } from "@/lib/tz";

/** Error con mensaje seguro para mostrar al visitante. */
export class BookingError extends Error {}

export type BookingContext = {
  business: { id: string; timezone: string; plan: string };
  settings: BookingSettings;
  /** El negocio cerró ese día (feriado, vacaciones). */
  closed: boolean;
  service: { id: string; duration_minutes: number };
  locationId: string | null;
  professionalId: string | null;
  windows: HourWindow[];
  busy: BusyRange[];
};

/**
 * Carga y VALIDA todo lo necesario para ofrecer o aceptar una reserva:
 * negocio, servicio, sucursal, profesional y sus relaciones, horario de atención
 * (en la zona del negocio) y citas que ocupan el mismo recurso ese día.
 * Se usa tanto para listar horarios como para validar la reserva.
 */
export async function loadBookingContext(
  sb: SupabaseClient,
  input: {
    businessId: string;
    serviceId: string;
    locationId?: string | null;
    professionalId?: string | null;
    date: string;
  },
): Promise<BookingContext> {
  const { businessId, serviceId } = input;
  const locationId = input.locationId ?? null;
  const professionalId = input.professionalId ?? null;

  // Libera horarios retenidos por reservas pendientes que nadie confirmó.
  await sb.rpc("expire_stale_pending", { _business_id: businessId });

  const { data: biz } = await sb
    .from("businesses")
    .select(
      "id,timezone,plan,booking_min_lead_minutes,booking_max_ahead_days,booking_slot_step_minutes,booking_buffer_minutes,booking_cancel_min_hours,booking_max_no_shows",
    )
    .eq("id", businessId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!biz) throw new BookingError("Negocio no encontrado");
  const tz = biz.timezone ?? "America/Lima";

  const { data: svc } = await sb
    .from("services")
    .select("id,duration_minutes")
    .eq("id", serviceId)
    .eq("business_id", businessId)
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();
  if (!svc) throw new BookingError("Servicio no disponible");

  // Sucursal: si el negocio tiene sucursales activas, hay que elegir una de ellas.
  const { data: locs } = await sb
    .from("locations")
    .select("id")
    .eq("business_id", businessId)
    .eq("is_active", true)
    .is("deleted_at", null);
  const activeLocIds = (locs ?? []).map((l) => l.id);
  if (activeLocIds.length > 0) {
    if (!locationId) throw new BookingError("Elige una sucursal");
    if (!activeLocIds.includes(locationId)) throw new BookingError("Sucursal no disponible");
  } else if (locationId) {
    throw new BookingError("Sucursal no disponible");
  }

  // Profesional: si hay profesionales activos, hay que elegir uno de este negocio.
  const { data: pros } = await sb
    .from("professionals")
    .select("id")
    .eq("business_id", businessId)
    .eq("is_active", true)
    .is("deleted_at", null);
  const activeProIds = (pros ?? []).map((p) => p.id);
  if (activeProIds.length > 0) {
    if (!professionalId) throw new BookingError("Elige un profesional");
    if (!activeProIds.includes(professionalId)) throw new BookingError("Profesional no disponible");
  } else if (professionalId) {
    throw new BookingError("Profesional no disponible");
  }

  if (professionalId) {
    // Las asignaciones se exigen cuando el negocio las configuró (mismo criterio que la página pública).
    const { data: offered } = await sb
      .from("professional_services")
      .select("service_id")
      .eq("professional_id", professionalId);
    if ((offered?.length ?? 0) > 0 && !offered!.some((r) => r.service_id === serviceId)) {
      throw new BookingError("Ese profesional no ofrece el servicio elegido");
    }
    if (locationId) {
      const { data: atLoc } = await sb
        .from("location_professionals")
        .select("professional_id")
        .eq("location_id", locationId);
      if ((atLoc?.length ?? 0) > 0 && !atLoc!.some((r) => r.professional_id === professionalId)) {
        throw new BookingError("Ese profesional no atiende en la sucursal elegida");
      }
    }
  }

  // Cierres puntuales (feriados, vacaciones): ese día no se ofrece ningún horario.
  const { data: closures } = await sb
    .from("availability_exceptions")
    .select("id")
    .eq("business_id", businessId)
    .lte("starts_on", input.date)
    .gte("ends_on", input.date)
    .limit(1);
  const closed = (closures?.length ?? 0) > 0;

  // Horario de atención (sucursal o general) para el día de la semana de la fecha del negocio.
  const dow = dayOfWeekOfYmd(input.date);
  let windows: HourWindow[] = [];
  if (!closed && locationId) {
    const { data } = await sb
      .from("location_hours")
      .select("start_time,end_time")
      .eq("location_id", locationId)
      .eq("day_of_week", dow);
    windows = data ?? [];
  }
  if (!closed && windows.length === 0) {
    const { data } = await sb
      .from("availability_rules")
      .select("start_time,end_time")
      .eq("business_id", businessId)
      .eq("day_of_week", dow);
    windows = data ?? [];
  }

  // Citas activas que ocupan el mismo recurso: profesional > sucursal > negocio.
  const { start, end } = dayBoundsOfYmd(input.date, tz);
  let q = sb
    .from("appointments")
    .select("starts_at,ends_at")
    .eq("business_id", businessId)
    .in("status", ["pending", "booked"])
    .lt("starts_at", end.toISOString())
    .gt("ends_at", start.toISOString());
  if (professionalId) q = q.eq("professional_id", professionalId);
  else if (locationId) q = q.eq("location_id", locationId).is("professional_id", null);
  else q = q.is("professional_id", null).is("location_id", null);
  const { data: busy, error: busyErr } = await q;
  if (busyErr) throw new Error(busyErr.message);

  return {
    business: { id: biz.id, timezone: tz, plan: biz.plan },
    settings: settingsFromBusiness(biz),
    closed,
    service: svc,
    locationId,
    professionalId,
    windows,
    busy: busy ?? [],
  };
}

export function slotsFromContext(ctx: BookingContext, date: string) {
  return computeSlots({
    date,
    tz: ctx.business.timezone,
    windows: ctx.windows,
    busy: ctx.busy,
    durationMinutes: ctx.service.duration_minutes,
    settings: ctx.settings,
  });
}
