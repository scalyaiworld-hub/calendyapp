import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Toda la autorización del panel vive aquí, en el servidor. La pantalla /admin solo
// oculta la interfaz; sin rol 'admin' en user_roles estas funciones rechazan la llamada.
async function isAdminUser(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return { admin: !!data, supabaseAdmin };
}

async function requireAdmin(userId: string) {
  const { admin, supabaseAdmin } = await isAdminUser(userId);
  if (!admin) throw new Error("Acceso denegado");
  return supabaseAdmin;
}

export type AdminBusiness = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  ownerEmail: string | null;
  createdAt: string;
  onboardingCompleted: boolean;
  deleted: boolean;
  apptsThisMonth: number;
};

export type AdminPreregistration = {
  id: string;
  createdAt: string;
  nombre: string;
  email: string;
  negocio: string | null;
  telefono: string | null;
};

export type AdminOverview = {
  businesses: AdminBusiness[];
  preregistrations: AdminPreregistration[];
  totals: { businesses: number; free: number; pro: number; studio: number; preregistrations: number };
};

export const getAdminStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ isAdmin: boolean }> => {
    const { admin } = await isAdminUser(context.userId);
    return { isAdmin: admin };
  });

export const getAdminOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminOverview> => {
    const sb = await requireAdmin(context.userId);

    const start = new Date();
    start.setUTCDate(1);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + 1);

    const [biz, appts, pre, users] = await Promise.all([
      sb
        .from("businesses")
        .select("id,name,slug,plan,owner_id,created_at,onboarding_completed,deleted_at")
        .order("created_at", { ascending: false })
        .limit(500),
      sb
        .from("appointments")
        .select("business_id")
        .gte("starts_at", start.toISOString())
        .lt("starts_at", end.toISOString())
        .in("status", ["pending", "booked", "completed"])
        .limit(20000),
      sb.from("pro_preregistrations").select("*").order("created_at", { ascending: false }).limit(200),
      sb.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);
    if (biz.error) throw new Error(biz.error.message);
    if (appts.error) throw new Error(appts.error.message);
    if (pre.error) throw new Error(pre.error.message);

    const counts = new Map<string, number>();
    for (const a of appts.data ?? []) counts.set(a.business_id, (counts.get(a.business_id) ?? 0) + 1);
    const emails = new Map<string, string | null>();
    for (const u of users.data?.users ?? []) emails.set(u.id, u.email ?? null);

    const businesses: AdminBusiness[] = (biz.data ?? []).map((b) => ({
      id: b.id,
      name: b.name,
      slug: b.slug,
      plan: b.plan,
      ownerEmail: emails.get(b.owner_id) ?? null,
      createdAt: b.created_at,
      onboardingCompleted: b.onboarding_completed,
      deleted: !!b.deleted_at,
      apptsThisMonth: counts.get(b.id) ?? 0,
    }));

    const active = businesses.filter((b) => !b.deleted);
    return {
      businesses,
      preregistrations: (pre.data ?? []).map((p) => ({
        id: p.id,
        createdAt: p.created_at,
        nombre: p.nombre,
        email: p.email,
        negocio: p.negocio,
        telefono: p.telefono,
      })),
      totals: {
        businesses: active.length,
        free: active.filter((b) => b.plan === "free").length,
        pro: active.filter((b) => b.plan === "pro").length,
        studio: active.filter((b) => b.plan === "studio").length,
        preregistrations: pre.data?.length ?? 0,
      },
    };
  });

const planSchema = z.object({
  businessId: z.string().uuid(),
  plan: z.enum(["free", "pro", "studio"]),
});

export const setBusinessPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => planSchema.parse(input))
  .handler(async ({ data, context }) => {
    const sb = await requireAdmin(context.userId);
    const { error } = await sb.from("businesses").update({ plan: data.plan }).eq("id", data.businessId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
