import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertModule } from "@/lib/api/plan-guard";
import { buildInviteEmail, MAX_TEAM_SIZE } from "@/lib/team";
import { ASSIGNABLE_ROLES, type AssignableRole } from "@/lib/permissions";

const roleSchema = z.enum(ASSIGNABLE_ROLES as [AssignableRole, ...AssignableRole[]]);
const base = z.object({ businessId: z.string().uuid() });

// El rol "professional" exige un profesional; los demás roles no pueden llevarlo.
const roleFields = z
  .object({ role: roleSchema, professionalId: z.string().uuid().nullable().optional() })
  .refine((v) => (v.role === "professional") === !!v.professionalId, {
    message: "El rol Profesional requiere elegir un profesional (y los demás roles no).",
  });

const inviteSchema = base
  .extend({ email: z.string().trim().toLowerCase().email().max(254) })
  .and(roleFields);
const updateSchema = base.extend({ userId: z.string().uuid() }).and(roleFields);
const removeSchema = base.extend({ userId: z.string().uuid() });
const revokeSchema = base.extend({ inviteId: z.string().uuid() });

/** Solo el dueño gestiona el equipo, y solo si su plan incluye el módulo. */
async function requireOwner(context: { supabase: any; userId: string }, businessId: string) {
  const { data, error } = await context.supabase
    .from("businesses")
    .select("id,name")
    .eq("id", businessId)
    .eq("owner_id", context.userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Solo el dueño puede gestionar el equipo.");
  await assertModule(context.supabase, businessId, "rolesPermissions");
  return data as { id: string; name: string };
}

async function assertProfessionalInBusiness(supabase: any, businessId: string, professionalId: string | null | undefined) {
  if (!professionalId) return;
  const { data, error } = await supabase
    .from("professionals")
    .select("id")
    .eq("id", professionalId)
    .eq("business_id", businessId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Ese profesional no existe en tu negocio.");
}

export type TeamMember = { userId: string; email: string | null; role: AssignableRole; professionalId: string | null; createdAt: string };
export type TeamInvite = { id: string; email: string; role: AssignableRole; professionalId: string | null; createdAt: string };

export const listTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => base.parse(input))
  .handler(async ({ data, context }): Promise<{ members: TeamMember[]; invites: TeamInvite[] }> => {
    await requireOwner(context, data.businessId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: members, error: mErr }, { data: invites, error: iErr }] = await Promise.all([
      supabaseAdmin.from("business_members").select("user_id,role,professional_id,created_at").eq("business_id", data.businessId).order("created_at"),
      supabaseAdmin.from("business_invites").select("id,email,role,professional_id,created_at").eq("business_id", data.businessId).order("created_at"),
    ]);
    if (mErr) throw new Error(mErr.message);
    if (iErr) throw new Error(iErr.message);

    const emails = await Promise.all(
      (members ?? []).map(async (m) => {
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(m.user_id);
        return u?.user?.email ?? null;
      }),
    );
    return {
      members: (members ?? []).map((m, i) => ({
        userId: m.user_id,
        email: emails[i],
        role: m.role,
        professionalId: m.professional_id,
        createdAt: m.created_at,
      })),
      invites: (invites ?? []).map((i) => ({ id: i.id, email: i.email, role: i.role, professionalId: i.professional_id, createdAt: i.created_at })),
    };
  });

export const inviteTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => inviteSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true; emailSent: boolean }> => {
    const business = await requireOwner(context, data.businessId);
    await assertProfessionalInBusiness(context.supabase, data.businessId, data.professionalId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if ((context.claims as { email?: string }).email?.toLowerCase() === data.email) {
      throw new Error("Ese email es el tuyo: ya eres el dueño del negocio.");
    }

    const [{ count: members }, { count: invites }] = await Promise.all([
      supabaseAdmin.from("business_members").select("id", { count: "exact", head: true }).eq("business_id", data.businessId),
      supabaseAdmin.from("business_invites").select("id", { count: "exact", head: true }).eq("business_id", data.businessId),
    ]);
    if ((members ?? 0) + (invites ?? 0) >= MAX_TEAM_SIZE) throw new Error(`Llegaste al máximo de ${MAX_TEAM_SIZE} personas en el equipo.`);

    const { data: invite, error } = await supabaseAdmin
      .from("business_invites")
      .insert({
        business_id: data.businessId,
        email: data.email,
        role: data.role,
        professional_id: data.role === "professional" ? data.professionalId! : null,
        invited_by: context.userId,
      })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") throw new Error("Ya hay una invitación pendiente para ese email.");
      throw new Error(error.message);
    }

    // El correo es un extra: si falla, la invitación igual queda creada y se aceptará al registrarse.
    let emailSent = false;
    try {
      const { sendEmail } = await import("@/lib/email.server");
      const origin = new URL(getRequest().url).origin;
      const mail = buildInviteEmail({ businessName: business.name, role: data.role, signInUrl: `${origin}/auth` });
      await sendEmail({ to: data.email, ...mail, idempotencyKey: `invite-${invite.id}` });
      emailSent = true;
    } catch (e) {
      console.error("[team] invite email failed", e instanceof Error ? e.message : e);
    }
    return { ok: true, emailSent };
  });

export const updateTeamMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => updateSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireOwner(context, data.businessId);
    await assertProfessionalInBusiness(context.supabase, data.businessId, data.professionalId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: updated, error } = await supabaseAdmin
      .from("business_members")
      .update({ role: data.role, professional_id: data.role === "professional" ? data.professionalId! : null })
      .eq("business_id", data.businessId)
      .eq("user_id", data.userId)
      .select("id");
    if (error) throw new Error(error.message);
    if (!updated?.length) throw new Error("Ese miembro ya no pertenece al equipo.");
    return { ok: true as const };
  });

export const removeTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => removeSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireOwner(context, data.businessId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("business_members").delete().eq("business_id", data.businessId).eq("user_id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const revokeTeamInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => revokeSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireOwner(context, data.businessId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("business_invites").delete().eq("id", data.inviteId).eq("business_id", data.businessId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/**
 * Convierte en membresías las invitaciones pendientes del email del usuario que inició sesión.
 * Solo cuenta si el email está CONFIRMADO en Supabase Auth; si no, cualquiera podría registrarse
 * con el email de otra persona y quedarse con su invitación. Comparación exacta con el email en
 * minúsculas (nunca ilike: "_" y "%" son comodines).
 */
export const acceptPendingInvites = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ accepted: number }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: found } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    const user = found?.user;
    if (!user?.email || !user.email_confirmed_at) return { accepted: 0 };

    const { data: invites, error } = await supabaseAdmin
      .from("business_invites")
      .select("id,business_id,role,professional_id")
      .eq("email", user.email.toLowerCase());
    if (error) throw new Error(error.message);

    let accepted = 0;
    for (const inv of invites ?? []) {
      const { data: biz } = await supabaseAdmin.from("businesses").select("owner_id,plan,deleted_at").eq("id", inv.business_id).maybeSingle();
      if (!biz || biz.deleted_at || biz.plan !== "studio" || biz.owner_id === context.userId) continue;
      const { error: upErr } = await supabaseAdmin
        .from("business_members")
        .upsert(
          { business_id: inv.business_id, user_id: context.userId, role: inv.role, professional_id: inv.professional_id },
          { onConflict: "business_id,user_id" },
        );
      if (upErr) {
        console.error("[team] accept invite failed", upErr.message);
        continue; // se conserva la invitación (p. ej. el profesional ya no existe)
      }
      await supabaseAdmin.from("business_invites").delete().eq("id", inv.id);
      accepted++;
    }
    return { accepted };
  });
