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

export const createPublicBooking = createServerFn({ method: "POST" })
  .inputValidator((input) => schema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Validar negocio y servicio activos
    const { data: biz } = await supabaseAdmin
      .from("businesses")
      .select("id")
      .eq("id", data.businessId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!biz) throw new Error("Negocio no encontrado");

    const { data: svc } = await supabaseAdmin
      .from("services")
      .select("id")
      .eq("id", data.serviceId)
      .eq("business_id", data.businessId)
      .eq("is_active", true)
      .is("deleted_at", null)
      .maybeSingle();
    if (!svc) throw new Error("Servicio no disponible");

    // Dedupe de cliente por teléfono (con bypass de RLS)
    const { data: existing } = await supabaseAdmin
      .from("clients")
      .select("id, name")
      .eq("business_id", data.businessId)
      .eq("phone", data.phone)
      .eq("phone_country_code", data.countryCode)
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
          phone: data.phone,
          phone_country_code: data.countryCode,
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
    if (apptErr) throw new Error(apptErr.message);

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