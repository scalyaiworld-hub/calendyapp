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