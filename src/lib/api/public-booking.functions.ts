import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getPlan, hasModule } from "@/lib/plans";
import { isSlotOffered, settingsFromBusiness } from "@/lib/availability-core";
import { monthBoundsInTz, ymdInTz } from "@/lib/tz";

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const schema = z.object({
  businessId: z.string().uuid(),
  serviceId: z.string().uuid(),
  locationId: z.string().uuid().nullable().optional(),
  professionalId: z.string().uuid().nullable().optional(),
  startsAt: z.string().min(1),
  endsAt: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(3).max(40),
  countryCode: z.string().trim().min(1).max(8),
  // Token del captcha (Cloudflare Turnstile); solo se exige si el servidor lo tiene configurado.
  captchaToken: z.string().max(2048).optional(),
});

function normalizePhone(p: string): string {
  return p.replace(/[^0-9+]/g, "");
}

const slotsSchema = z.object({
  businessId: z.string().uuid(),
  serviceId: z.string().uuid(),
  date: ymd,
  locationId: z.string().uuid().nullable().optional(),
  professionalId: z.string().uuid().nullable().optional(),
});

/**
 * Horarios disponibles de un día (fecha calendario del negocio). Usa el mismo
 * cálculo que valida la reserva, así que lo que se ofrece es lo que se acepta.
 */
export const getPublicSlots = createServerFn({ method: "POST" })
  .inputValidator((input) => slotsSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadBookingContext, slotsFromContext, BookingError } = await import("@/lib/booking.server");
    try {
      const ctx = await loadBookingContext(supabaseAdmin, data);
      if (ctx.closed) return { slots: [], timezone: ctx.business.timezone, error: "El negocio no atiende ese día" as string | null };
      return { slots: slotsFromContext(ctx, data.date), timezone: ctx.business.timezone, error: null as string | null };
    } catch (e) {
      if (e instanceof BookingError) return { slots: [], timezone: null as string | null, error: e.message };
      throw e;
    }
  });

export const createPublicBooking = createServerFn({ method: "POST" })
  .inputValidator((input) => schema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadBookingContext, slotsFromContext, BookingError } = await import("@/lib/booking.server");
    const { BOOKING_LIMITS, enforceBookingRate, getClientIp, hashIp, verifyCaptcha } = await import("@/lib/booking-guard.server");

    const startsAt = new Date(data.startsAt);
    const endsAt = new Date(data.endsAt);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      throw new BookingError("Fecha inválida");
    }
    if (endsAt <= startsAt) throw new BookingError("Rango de tiempo inválido");

    const normalizedPhone = normalizePhone(data.phone);
    const normalizedCC = normalizePhone(data.countryCode);
    if (!/^\+?[0-9]{7,15}$/.test(normalizedPhone)) throw new BookingError("Teléfono inválido");

    // Anti-abuso: captcha + límite de intentos por IP y teléfono.
    const ip = await getClientIp();
    await verifyCaptcha(data.captchaToken, ip);

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
      throw new BookingError(`La reserva debe ser con al menos ${rules.minLeadMinutes} minutos de anticipación`);
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
      if ((count ?? 0) >= monthlyLimit) throw new BookingError("Este negocio alcanzó su límite de citas del mes");
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
      throw new BookingError("No puedes reservar en línea por inasistencias previas. Contacta directamente al negocio");
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
        throw new BookingError("Ya tienes reservas pendientes de confirmar con este negocio. Espera su confirmación");
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
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      clientId = inserted.id;
    }
    // Si el cliente ya existe NO se sobrescribe su nombre: cualquiera que conozca un teléfono
    // podría alterar la ficha. El negocio puede corregirla desde Clientes.

    // Crear la cita (los constraints de la base son la última barrera ante carreras)
    const { data: created, error: apptErr } = await supabaseAdmin.from("appointments").insert({
      business_id: data.businessId,
      client_id: clientId,
      service_id: data.serviceId,
      location_id: ctx.locationId,
      professional_id: ctx.professionalId,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      source: "booking_page",
      status: "pending",
    }).select("manage_token").single();
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

    // El token permite al cliente ver y cancelar su cita desde /cita/:token.
    return { ok: true, clientId, manageToken: created.manage_token };
  });

/**
 * Single bootstrap call for the public booking page.
 * Runs all reads in parallel server-side using the admin client so the
 * browser only does ONE network roundtrip instead of 5–6 cascading queries.
 * All returned data is intentionally public (visible on the booking page).
 */
const bootstrapSchema = z.object({ slug: z.string().trim().min(1).max(120) });

export const getPublicBusinessBootstrap = createServerFn({ method: "GET" })
  .inputValidator((input) => bootstrapSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: business } = await supabaseAdmin
      .from("businesses")
      .select("id,name,slug,timezone,logo_url,industry,created_at,brand_primary,brand_background,brand_font,plan")
      .eq("slug", data.slug)
      .is("deleted_at", null)
      .maybeSingle();

    if (!business) {
      return {
        business: null,
        locations: [],
        professionals: [],
        services: [],
        locationPros: [],
        professionalServices: [],
      };
    }

    // La marca personalizada es un módulo de plan: sin él se sirve el tema por defecto.
    // El plan no se expone en la página pública.
    const { plan, ...publicBusiness } = business;
    if (!hasModule(plan, "branding")) {
      publicBusiness.brand_primary = null;
      publicBusiness.brand_background = null;
      publicBusiness.brand_font = null;
    }

    const businessId = business.id;
    // 1) Cargar entidades base en paralelo
    const [locsRes, prosRes, svcsRes] = await Promise.all([
      supabaseAdmin
        .from("locations")
        .select("id,business_id,name,address,is_active,created_at")
        .eq("business_id", businessId)
        .is("deleted_at", null)
        .eq("is_active", true)
        .order("created_at"),
      supabaseAdmin
        .from("professionals")
        .select("id,name,avatar_url,is_active,deleted_at")
        .eq("business_id", businessId)
        .is("deleted_at", null)
        .eq("is_active", true)
        .order("name"),
      supabaseAdmin
        .from("services")
        .select("id,name,description,duration_minutes,price_cents,display_order,is_active,deleted_at")
        .eq("business_id", businessId)
        .is("deleted_at", null)
        .eq("is_active", true)
        .order("display_order"),
    ]);

    const proIds = (prosRes.data ?? []).map((p: any) => p.id);
    const svcIds = (svcsRes.data ?? []).map((s: any) => s.id);

    // 2) Asignaciones, acotadas a los IDs de este negocio
    const [locProsRes, proSvcsRes] = await Promise.all([
      proIds.length
        ? supabaseAdmin.from("location_professionals").select("location_id, professional_id").in("professional_id", proIds)
        : Promise.resolve({ data: [] as any[] }),
      proIds.length && svcIds.length
        ? supabaseAdmin.from("professional_services").select("professional_id, service_id").in("professional_id", proIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    return {
      business: publicBusiness,
      locations: locsRes.data ?? [],
      professionals: prosRes.data ?? [],
      services: svcsRes.data ?? [],
      locationPros: (locProsRes as any).data ?? [],
      professionalServices: (proSvcsRes as any).data ?? [],
    };
  });