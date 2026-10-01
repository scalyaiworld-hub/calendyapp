import { escapeHtml } from "@/lib/reminders";
import { ROLE_LABELS, type AssignableRole } from "@/lib/permissions";

export const MAX_TEAM_SIZE = 25; // miembros + invitaciones pendientes por negocio

export function buildInviteEmail(input: {
  businessName: string;
  role: AssignableRole;
  signInUrl: string;
}) {
  const business = input.businessName.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
  const role = ROLE_LABELS[input.role];
  const subject = `Te invitaron a ${business} en Calendya`;
  const text = [
    `Te invitaron a unirte al equipo de ${business} en Calendya con el rol de ${role}.`,
    "",
    "Para aceptar, crea tu cuenta (o inicia sesión) con ESTE mismo email:",
    input.signInUrl,
    "",
    "Si no esperabas esta invitación, puedes ignorar este correo.",
  ].join("\n");
  const html = `<!doctype html>
<html lang="es"><body style="margin:0;padding:24px;background:#f6f6f7;font-family:Arial,Helvetica,sans-serif;color:#18181b;">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px;">
    <p style="margin:0 0 16px;font-size:16px;">Te invitaron a unirte al equipo de <strong>${escapeHtml(business)}</strong> en Calendya con el rol de <strong>${escapeHtml(role)}</strong>.</p>
    <p style="margin:0 0 24px;font-size:15px;">Para aceptar, crea tu cuenta (o inicia sesión) con <strong>este mismo email</strong>.</p>
    <p style="margin:0 0 24px;"><a href="${escapeHtml(input.signInUrl)}" style="display:inline-block;background:#2a4fd0;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:15px;">Aceptar invitación</a></p>
    <p style="margin:0;font-size:13px;color:#71717a;">Si no esperabas esta invitación, puedes ignorar este correo.</p>
  </div>
</body></html>`;
  return { subject, html, text };
}
