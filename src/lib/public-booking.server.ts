import type { SupabaseClient } from "@supabase/supabase-js";
import { getPlan } from "@/lib/plans";
import { isSlotOffered, settingsFromBusiness } from "@/lib/availability-core";
import { monthBoundsInTz, ymdInTz } from "@/lib/tz";
import { BookingError, loadBookingContext, slotsFromContext } from "@/lib/booking.server";
import { BOOKING_LIMITS, enforceBookingRate, hashIp } from "@/lib/booking-guard.server";

/**
 * Reserva pública: la usan la página /b/:slug y el chat con IA, para que ninguna de las dos pueda
 * saltarse una regla (anticipación, no-shows, cupos, anti-abuso, solapes...). Código movido tal cual
 * desde createPublicBooking; solo se parametrizan el origen de la cita (`source`) y la IP.
 */
export type BookingSubmission = {
  businessId: string;
  serviceId: string;
  locationId?: string | null;
  professionalId?: string | null;
  startsAt: string;
  endsAt: string;
  name: string;
  phone: string;
  countryCode: string;
  email?: string;
};

export function normalizePhone(p: string): string {
  return p.replace(/[^0-9+]/g, "");
}

export type PreparedBooking = {
  startsAt: Date;
  endsAt: Date;
  normalizedPhone: string;
  normalizedCC: string;
};

/** Validación barata previa (fechas y teléfono), antes de gastar el captcha o tocar la base. */
export function prepareBooking(data: BookingSubmission): PreparedBooking {
  const startsAt = new Date(data.startsAt);
  const endsAt = new Date(data.endsAt);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    throw new BookingError("Fecha inválida");
  }
  if (endsAt <= startsAt) throw new BookingError("Rango de tiempo inválido");

  const normalizedPhone = normalizePhone(data.phone);
  const normalizedCC = normalizePhone(data.countryCode);
  if (!/^\+?[0-9]{7,15}$/.test(normalizedPhone)) throw new BookingError("Teléfono inválido");
  return { startsAt, endsAt, normalizedPhone, normalizedCC };
}

export async function submitPublicBooking(
  supabaseAdmin: SupabaseClient,
  data: BookingSubmission,
  prepared: PreparedBooking,
  opts: { source: "booking_page" | "chat_ai"; ip: string },
): Promise<{ ok: true; clientId: string; manageToken: string | null }> {
  const { startsAt, endsAt, normalizedPhone, normalizedCC } = prepared;
  const { ip } = opts;

  const { data: bizRow } = await supabaseAdmin
    .from("businesses")
    .select("timezone,booking_min_lead_minutes,booking_max_ahead_days,booking_max_no_shows")
    .eq("id", data.businessId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!bizRow) throw new BookingError("Negocio no encontrado");
  const tz = bizRow.timezone ?? "America/Lima";

  // Anticipación mínima y máxima configuradas por el negocio.
  const rules = settingsFromBusiness(bizRow);
  const now = Date.now();
  if (startsAt.getTime() < now + rules.minLeadMinutes * 60_000) {
    throw new BookingError(
      `La reserva debe ser con al menos ${rules.minLeadMinutes} minutos de anticipación`,
    );
  }
  if (startsAt.getTime() > now + rules.maxAheadDays * 86_400_000) {
    throw new BookingError(`Solo puedes reservar hasta ${rules.maxAheadDays} días por adelantado`);
  }

  await enforceBookingRate(supabaseAdmin, {
    businessId: data.businessId,
    ipHash: await hashIp(ip),
    phone: `${normalizedCC}${normalizedPhone}`,
  });

  // Validación completa (negocio, servicio, sucursal, profesional, relaciones, horario)
  // con el mismo cálculo que usa la página pública para listar horarios.
  const date = ymdInTz(startsAt, tz);
  const ctx = await loadBookingContext(supabaseAdmin, { ...data, date });
  if (ctx.closed) throw new BookingError("El negocio no atiende ese día");

  const requestedMinutes = Math.round((endsAt.getTime() - startsAt.getTime()) / 60000);
  if (requestedMinutes !== ctx.service.duration_minutes) {
    throw new BookingError("Duración del servicio no coincide");
  }
  if (!isSlotOffered(slotsFromContext(ctx, date), startsAt, endsAt)) {
    throw new BookingError("Ese horario ya no está disponible, elige otro");
  }

  // Cortesía: si el cupo mensual de citas confirmadas ya está lleno, la cita no podría confirmarse.
  const monthlyLimit = getPlan(ctx.business.plan).limits.appointmentsPerMonth;
  if (monthlyLimit !== null) {
    const { start, end } = monthBoundsInTz(startsAt, tz);
    const { count } = await supabaseAdmin
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("business_id", data.businessId)
      .in("status", ["booked", "completed", "no_show"])
      .gte("starts_at", start.toISOString())
      .lt("starts_at", end.toISOString());
    if ((count ?? 0) >= monthlyLimit)
      throw new BookingError("Este negocio alcanzó su límite de citas del mes");
  }

  // Dedupe de cliente por teléfono (con bypass de RLS)
  const { data: existing } = await supabaseAdmin
    .from("clients")
    .select("id, name, no_show_count")
    .eq("business_id", data.businessId)
    .eq("phone", normalizedPhone)
    .eq("phone_country_code", normalizedCC)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Política de no-shows: pasado el umbral, la reserva online requiere hablar con el negocio.
  if (rules.maxNoShows !== null && (existing?.no_show_count ?? 0) >= rules.maxNoShows) {
    throw new BookingError(
      "No puedes reservar en línea por inasistencias previas. Contacta directamente al negocio",
    );
  }

  let clientId = existing?.id;
  if (clientId) {
    const { count: pendingCount } = await supabaseAdmin
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("business_id", data.businessId)
      .eq("client_id", clientId)
      .eq("status", "pending");
    if ((pendingCount ?? 0) >= BOOKING_LIMITS.MAX_PENDING_PER_CLIENT) {
      throw new BookingError(
        "Ya tienes reservas pendientes de confirmar con este negocio. Espera su confirmación",
      );
    }
  }
  if (!clientId) {
    const { data: inserted, error } = await supabaseAdmin
      .from("clients")
      .insert({
        business_id: data.businessId,
        name: data.name,
        phone: normalizedPhone,
        phone_country_code: normalizedCC,
        email: data.email || null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    clientId = inserted.id;
  }
  // Si el cliente ya existe NO se sobrescribe su nombre: cualquiera que conozca un teléfono
  // podría alterar la ficha. El negocio puede corregirla desde Clientes.

  // Crear la cita (los constraints de la base son la última barrera ante carreras)
  const { data: created, error: apptErr } = await supabaseAdmin
    .from("appointments")
    .insert({
      business_id: data.businessId,
      client_id: clientId,
      service_id: data.serviceId,
      location_id: ctx.locationId,
      professional_id: ctx.professionalId,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      source: opts.source,
      status: "pending",
    })
    .select("manage_token")
    .single();
  if (apptErr) {
    const msg = apptErr.message ?? "";
    if (msg.includes("appts_no_overlap")) {
      throw new BookingError("Ese horario ya fue tomado, elige otro");
    }
    if (msg.includes("APPT_REF_MISMATCH")) {
      throw new BookingError("Los datos de la reserva no son válidos");
    }
    throw new Error(apptErr.message);
  }

  // Correo de "recibimos tu reserva" (best effort: un fallo no deshace la cita).
  if (data.email) {
    try {
      const [{ data: biz }, { data: svc }, loc] = await Promise.all([
        supabaseAdmin.from("businesses").select("name").eq("id", data.businessId).maybeSingle(),
        supabaseAdmin.from("services").select("name").eq("id", data.serviceId).maybeSingle(),
        ctx.locationId
          ? supabaseAdmin.from("locations").select("name").eq("id", ctx.locationId).maybeSingle()
          : Promise.resolve({ data: null as { name: string } | null }),
      ]);
      const { sendEmail, buildBookingReceivedEmail, getSiteOrigin } =
        await import("@/lib/email.server");
      const origin = await getSiteOrigin();
      await sendEmail({
        to: data.email,
        ...buildBookingReceivedEmail({
          clientName: data.name,
          businessName: biz?.name ?? "el negocio",
          serviceName: svc?.name ?? "Servicio",
          locationName: loc.data?.name ?? null,
          startsAt,
          timezone: tz,
          manageUrl:
            origin && created.manage_token ? `${origin}/cita/${created.manage_token}` : null,
        }),
      });
    } catch (e) {
      console.error("[booking] correo de confirmación falló", e instanceof Error ? e.message : e);
    }
  }

  // El token permite al cliente ver y cancelar su cita desde /cita/:token.
  return { ok: true, clientId, manageToken: created.manage_token };
}
