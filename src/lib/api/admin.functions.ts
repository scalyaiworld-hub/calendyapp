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

export type AdminUpgradeRequest = {
  id: string;
  createdAt: string;
  plan: string;
  status: string;
  name: string;
  email: string;
  phone: string | null;
  industry: string;
  message: string | null;
  businessName: string | null;
  businessSlug: string | null;
};

export type AdminOverview = {
  businesses: AdminBusiness[];
  /** Total de negocios que cumplen la búsqueda (para paginar). */
  businessesTotal: number;
  page: number;
  pageSize: number;
  preregistrations: AdminPreregistration[];
  upgradeRequests: AdminUpgradeRequest[];
  totals: { businesses: number; free: number; pro: number; studio: number; preregistrations: number; upgradeRequests: number };
};

export const getAdminStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ isAdmin: boolean }> => {
    const { admin } = await isAdminUser(context.userId);
    return { isAdmin: admin };
  });

const overviewSchema = z
  .object({
    search: z.string().trim().max(100).optional(),
    page: z.number().int().min(0).max(10_000).optional(),
    pageSize: z.number().int().min(10).max(100).optional(),
  })
  .optional();

export const getAdminOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => overviewSchema.parse(input))
  .handler(async ({ data, context }): Promise<AdminOverview> => {
    const sb = await requireAdmin(context.userId);
    const page = data?.page ?? 0;
    const pageSize = data?.pageSize ?? 50;

    // Búsqueda, paginación, totales y conteo de citas del mes se resuelven en SQL:
    // sin los límites silenciosos de antes (500 negocios / 20 000 citas / 1000 usuarios).
    const [list, totalsRes, pre, upg] = await Promise.all([
      sb.rpc("admin_list_businesses", { _search: data?.search || undefined, _limit: pageSize, _offset: page * pageSize }),
      sb.rpc("admin_totals"),
      sb.from("pro_preregistrations").select("*").order("created_at", { ascending: false }).limit(200),
      sb.from("upgrade_requests").select("*").order("created_at", { ascending: false }).limit(200),
    ]);
    if (list.error) throw new Error(list.error.message);
    if (totalsRes.error) throw new Error(totalsRes.error.message);
    if (pre.error) throw new Error(pre.error.message);
    // Si la migración de upgrade_requests aún no está aplicada, el panel sigue funcionando sin ellas.
    const upgradeRows = upg.error ? [] : (upg.data ?? []);

    const rows = list.data ?? [];
    const businesses: AdminBusiness[] = rows.map((b) => ({
      id: b.id,
      name: b.name,
      slug: b.slug,
      plan: b.plan,
      ownerEmail: b.owner_email,
      createdAt: b.created_at,
      onboardingCompleted: b.onboarding_completed,
      deleted: b.deleted,
      apptsThisMonth: Number(b.appts_this_month),
    }));

    // Nombres de los negocios de las solicitudes de upgrade (pueden no estar en la página actual).
    const bizIds = Array.from(new Set(upgradeRows.map((r) => r.business_id)));
    const { data: bizNames } = bizIds.length
      ? await sb.from("businesses").select("id,name,slug").in("id", bizIds)
      : { data: [] as { id: string; name: string; slug: string }[] };
    const bizById = new Map((bizNames ?? []).map((b) => [b.id, b]));

    const upgradeRequests: AdminUpgradeRequest[] = upgradeRows.map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      plan: r.plan,
      status: r.status,
      name: r.name,
      email: r.email,
      phone: r.phone,
      industry: r.industry,
      message: r.message,
      businessName: bizById.get(r.business_id)?.name ?? null,
      businessSlug: bizById.get(r.business_id)?.slug ?? null,
    }));

    const t = totalsRes.data?.[0];
    return {
      businesses,
      businessesTotal: Number(rows[0]?.total_count ?? 0),
      page,
      pageSize,
      upgradeRequests,
      preregistrations: (pre.data ?? []).map((p) => ({
        id: p.id,
        createdAt: p.created_at,
        nombre: p.nombre,
        email: p.email,
        negocio: p.negocio,
        telefono: p.telefono,
      })),
      totals: {
        businesses: Number(t?.businesses ?? 0),
        free: Number(t?.free ?? 0),
        pro: Number(t?.pro ?? 0),
        studio: Number(t?.studio ?? 0),
        preregistrations: Number(t?.preregistrations ?? 0),
        upgradeRequests: Number(t?.new_upgrade_requests ?? 0),
      },
    };
  });

const requestStatusSchema = z.object({
  requestId: z.string().uuid(),
  status: z.enum(["new", "contacted", "won", "lost"]),
});

/** Avanza una solicitud de upgrade por su embudo (nueva → contactada → ganada / perdida) y lo audita. */
export const setUpgradeRequestStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => requestStatusSchema.parse(input))
  .handler(async ({ data, context }) => {
    const sb = await requireAdmin(context.userId);
    const { data: row, error } = await sb
      .from("upgrade_requests")
      .update({ status: data.status })
      .eq("id", data.requestId)
      .select("business_id,plan")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Solicitud no encontrada");
    await sb.from("audit_log").insert({
      business_id: row.business_id,
      user_id: context.userId,
      action: "upgrade_request.status_changed",
      entity_type: "upgrade_request",
      entity_id: data.requestId,
      metadata: { status: data.status, plan: row.plan },
    });
    return { ok: true as const };
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
    const { applyPlanChange } = await import("@/lib/plan-change.server");
    // Rechaza el cambio si el negocio excede los límites del plan destino; audita el cambio.
    await applyPlanChange(sb, { businessId: data.businessId, plan: data.plan, actorId: context.userId });

    // La solicitud de upgrade abierta de ese plan queda como ganada.
    if (data.plan !== "free") {
      await sb
        .from("upgrade_requests")
        .update({ status: "won" })
        .eq("business_id", data.businessId)
        .eq("plan", data.plan)
        .in("status", ["new", "contacted"]);
    }

    return { ok: true as const };
  });
