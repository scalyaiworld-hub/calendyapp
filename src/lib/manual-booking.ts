import { supabase } from "@/integrations/supabase/client";

type Window = { start_time: string; end_time: string };

export function timeToMinutes(t: string): number {
  const [h, m] = String(t).split(":").map(Number);
  return h * 60 + (m || 0);
}

/** ¿El rango [startMin, endMin] cabe completo dentro de alguna ventana de atención? */
export function windowsFit(startMin: number, endMin: number, windows: Window[]): boolean {
  return windows.some(
    (w) => startMin >= timeToMinutes(w.start_time) && endMin <= timeToMinutes(w.end_time),
  );
}

/**
 * Validaciones previas a crear una cita manual, para dar un error claro
 * en vez de depender solo de los constraints de la base.
 * Lanza Error con un mensaje listo para mostrar al usuario.
 */
export async function validateManualAppointment(opts: {
  businessId: string;
  serviceId: string;
  startsAt: Date;
  endsAt: Date;
  professionalId?: string | null;
  locationId?: string | null;
}): Promise<void> {
  const { businessId, serviceId, startsAt, endsAt, professionalId, locationId } = opts;

  if (startsAt.getTime() < Date.now()) {
    throw new Error("No puedes crear una cita en una fecha u hora que ya pasó.");
  }

  const { data: svc } = await supabase
    .from("services")
    .select("id")
    .eq("id", serviceId)
    .eq("business_id", businessId)
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();
  if (!svc) throw new Error("El servicio está inactivo o ya no existe.");

  if (professionalId) {
    const { data: pro } = await supabase
      .from("professionals")
      .select("id")
      .eq("id", professionalId)
      .eq("business_id", businessId)
      .eq("is_active", true)
      .is("deleted_at", null)
      .maybeSingle();
    if (!pro) throw new Error("El profesional está inactivo o ya no existe.");

    const { data: offers } = await supabase
      .from("professional_services")
      .select("service_id")
      .eq("professional_id", professionalId)
      .eq("service_id", serviceId)
      .limit(1);
    if (!offers || offers.length === 0)
      throw new Error("Ese profesional no ofrece el servicio elegido.");

    if (locationId) {
      const { data: atLoc } = await supabase
        .from("location_professionals")
        .select("location_id")
        .eq("location_id", locationId)
        .eq("professional_id", professionalId)
        .limit(1);
      if (!atLoc || atLoc.length === 0)
        throw new Error("Ese profesional no atiende en la sucursal elegida.");
    }
  }

  // Horario de atención: el de la sucursal si lo tiene; si no, el general del negocio.
  const dow = startsAt.getDay();
  let windows: Window[] = [];
  if (locationId) {
    const { data } = await supabase
      .from("location_hours")
      .select("start_time,end_time")
      .eq("location_id", locationId)
      .eq("day_of_week", dow);
    windows = data ?? [];
  }
  let hasAnySchedule = windows.length > 0;
  if (windows.length === 0) {
    const { data: all } = await supabase
      .from("availability_rules")
      .select("day_of_week,start_time,end_time")
      .eq("business_id", businessId);
    hasAnySchedule = (all?.length ?? 0) > 0;
    windows = (all ?? []).filter((r) => r.day_of_week === dow);
  }
  // Si el negocio aún no configuró horarios no se bloquea la creación manual.
  if (hasAnySchedule) {
    const startMin = startsAt.getHours() * 60 + startsAt.getMinutes();
    const endMin = endsAt.getHours() * 60 + endsAt.getMinutes();
    const sameDay = startsAt.toDateString() === endsAt.toDateString();
    if (windows.length === 0 || !sameDay || !windowsFit(startMin, endMin, windows)) {
      throw new Error(
        "La cita queda fuera del horario de atención. Revisa Horarios o elige otra hora.",
      );
    }
  }

  let clash = supabase
    .from("appointments")
    .select("id")
    .eq("business_id", businessId)
    .in("status", ["pending", "booked"])
    .lt("starts_at", endsAt.toISOString())
    .gt("ends_at", startsAt.toISOString())
    .limit(1);
  if (professionalId) clash = clash.eq("professional_id", professionalId);
  else if (locationId) clash = clash.eq("location_id", locationId).is("professional_id", null);
  const { data: overlapping } = await clash;
  if (overlapping && overlapping.length > 0) {
    throw new Error("Ya hay una cita en ese horario. Elige otro.");
  }
}
