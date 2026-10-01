import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { hasModule } from "@/lib/plans";

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
  // Opcional: si lo da, recibe un correo de "recibimos tu reserva".
  email: z.string().trim().email().max(254).optional().or(z.literal("")),
  // Token del captcha (Cloudflare Turnstile); solo se exige si el servidor lo tiene configurado.
  captchaToken: z.string().max(2048).optional(),
});

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
    const { loadBookingContext, slotsFromContext, BookingError } =
      await import("@/lib/booking.server");
    try {
      const ctx = await loadBookingContext(supabaseAdmin, data);
      if (ctx.closed)
        return {
          slots: [],
          timezone: ctx.business.timezone,
          error: "El negocio no atiende ese día" as string | null,
        };
      return {
        slots: slotsFromContext(ctx, data.date),
        timezone: ctx.business.timezone,
        error: null as string | null,
      };
    } catch (e) {
      if (e instanceof BookingError)
        return { slots: [], timezone: null as string | null, error: e.message };
      throw e;
    }
  });

export const createPublicBooking = createServerFn({ method: "POST" })
  .inputValidator((input) => schema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getClientIp, verifyCaptcha } = await import("@/lib/booking-guard.server");
    const { prepareBooking, submitPublicBooking } = await import("@/lib/public-booking.server");

    const prepared = prepareBooking(data);

    // Anti-abuso: captcha + límite de intentos por IP y teléfono.
    const ip = await getClientIp();
    await verifyCaptcha(data.captchaToken, ip);

    return submitPublicBooking(supabaseAdmin, data, prepared, { source: "booking_page", ip });
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
      .select(
        "id,name,slug,timezone,logo_url,industry,created_at,brand_primary,brand_background,brand_font,plan",
      )
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
        .select(
          "id,name,description,duration_minutes,price_cents,display_order,is_active,deleted_at",
        )
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
        ? supabaseAdmin
            .from("location_professionals")
            .select("location_id, professional_id")
            .in("professional_id", proIds)
        : Promise.resolve({ data: [] as any[] }),
      proIds.length && svcIds.length
        ? supabaseAdmin
            .from("professional_services")
            .select("professional_id, service_id")
            .in("professional_id", proIds)
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
