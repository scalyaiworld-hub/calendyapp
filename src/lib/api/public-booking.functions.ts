import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

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
});

function normalizePhone(p: string): string {
  return p.replace(/[^0-9+]/g, "");
}

export const createPublicBooking = createServerFn({ method: "POST" })
  .inputValidator((input) => schema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const startsAt = new Date(data.startsAt);
    const endsAt = new Date(data.endsAt);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      throw new Error("Fecha inválida");
    }
    if (endsAt <= startsAt) throw new Error("Rango de tiempo inválido");

    const now = Date.now();
    const MIN_LEAD_MS = 30 * 60 * 1000;
    const MAX_AHEAD_MS = 90 * 24 * 60 * 60 * 1000;
    if (startsAt.getTime() < now + MIN_LEAD_MS) {
      throw new Error("La reserva debe ser con al menos 30 minutos de anticipación");
    }
    if (startsAt.getTime() > now + MAX_AHEAD_MS) {
      throw new Error("Solo puedes reservar hasta 90 días por adelantado");
    }

    // Validar negocio y servicio activos
    const { data: biz } = await supabaseAdmin
      .from("businesses")
      .select("id, timezone")
      .eq("id", data.businessId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!biz) throw new Error("Negocio no encontrado");

    const { data: svc } = await supabaseAdmin
      .from("services")
      .select("id, duration_minutes")
      .eq("id", data.serviceId)
      .eq("business_id", data.businessId)
      .eq("is_active", true)
      .is("deleted_at", null)
      .maybeSingle();
    if (!svc) throw new Error("Servicio no disponible");

    // Verifica que la duración pedida coincida con la del servicio
    const requestedMinutes = Math.round((endsAt.getTime() - startsAt.getTime()) / 60000);
    if (requestedMinutes !== svc.duration_minutes) {
      throw new Error("Duración del servicio no coincide");
    }

    // Verifica horario (sucursal o reglas generales del negocio)
    const tz = biz.timezone ?? "America/Lima";
    const localStartForDow = new Date(startsAt.toLocaleString("en-US", { timeZone: tz }));
    const dow = localStartForDow.getDay();
    let hours: { start_time: string; end_time: string }[] | null = null;
    if (data.locationId) {
      const { data: lh } = await supabaseAdmin
        .from("location_hours")
        .select("start_time,end_time")
        .eq("location_id", data.locationId)
        .eq("day_of_week", dow);
      hours = lh;
    }
    if (!hours || hours.length === 0) {
      const { data: ar } = await supabaseAdmin
        .from("availability_rules")
        .select("start_time,end_time")
        .eq("business_id", data.businessId)
        .eq("day_of_week", dow);
      hours = ar;
    }
    if (!hours || hours.length === 0) {
      throw new Error("El negocio no atiende ese día");
    }
    const localStart = localStartForDow;
    const localEnd = new Date(endsAt.toLocaleString("en-US", { timeZone: tz }));
    const minutesOfDay = (d: Date) => d.getHours() * 60 + d.getMinutes();
    const sMin = minutesOfDay(localStart);
    const eMin = minutesOfDay(localEnd);
    const fits = hours.some((h) => {
      const [sh, sm] = h.start_time.split(":").map(Number);
      const [eh, em] = h.end_time.split(":").map(Number);
      return sMin >= sh * 60 + sm && eMin <= eh * 60 + em;
    });
    if (!fits) throw new Error("Horario fuera del rango de atención");

    // Verifica que el slot no esté ya ocupado (el constraint EXCLUDE es la verdad
    // última; esto da un error más claro al usuario antes del INSERT).
    let clashQ = supabaseAdmin
      .from("appointments")
      .select("id")
      .eq("business_id", data.businessId)
      .in("status", ["pending", "booked"])
      .lt("starts_at", endsAt.toISOString())
      .gt("ends_at", startsAt.toISOString())
      .limit(1);
    if (data.professionalId) clashQ = clashQ.eq("professional_id", data.professionalId);
    else if (data.locationId) clashQ = clashQ.eq("location_id", data.locationId).is("professional_id", null);
    const { data: clash } = await clashQ;
    if (clash && clash.length > 0) {
      throw new Error("Ese horario ya fue tomado, elige otro");
    }

    const normalizedPhone = normalizePhone(data.phone);
    const normalizedCC = normalizePhone(data.countryCode);
    if (!/^\+?[0-9]{7,15}$/.test(normalizedPhone)) {
      throw new Error("Teléfono inválido");
    }

    // Dedupe de cliente por teléfono (con bypass de RLS)
    const { data: existing } = await supabaseAdmin
      .from("clients")
      .select("id, name")
      .eq("business_id", data.businessId)
      .eq("phone", normalizedPhone)
      .eq("phone_country_code", normalizedCC)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let clientId = existing?.id;
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
    } else if (existing?.name !== data.name) {
      // Actualiza el nombre si cambió en la reserva
      await supabaseAdmin.from("clients").update({ name: data.name }).eq("id", clientId);
    }

    // Crear la cita
    const { error: apptErr } = await supabaseAdmin.from("appointments").insert({
      business_id: data.businessId,
      client_id: clientId,
      service_id: data.serviceId,
      location_id: data.locationId ?? null,
      professional_id: data.professionalId ?? null,
      starts_at: data.startsAt,
      ends_at: data.endsAt,
      source: "booking_page",
      status: "pending",
    });
    if (apptErr) {
      const msg = apptErr.message ?? "";
      if (msg.includes("PLAN_LIMIT_APPOINTMENTS")) {
        throw new Error("Este negocio alcanzó su límite de citas del mes");
      }
      if (msg.includes("appts_no_overlap")) {
        throw new Error("Ese horario ya fue tomado, elige otro");
      }
      throw new Error(apptErr.message);
    }

    return { ok: true, clientId };
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
      .select("id,name,slug,timezone,logo_url,industry,created_at,brand_primary,brand_background,brand_font")
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
      business,
      locations: locsRes.data ?? [],
      professionals: prosRes.data ?? [],
      services: svcsRes.data ?? [],
      locationPros: (locProsRes as any).data ?? [],
      professionalServices: (proSvcsRes as any).data ?? [],
    };
  });