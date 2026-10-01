import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Mail, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMyBusiness } from "@/lib/business";
import { PlanGate } from "@/components/PlanGate";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BlockSkeleton } from "@/components/Skeletons";
import { ASSIGNABLE_ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS, type AssignableRole } from "@/lib/permissions";
import { inviteTeamMember, listTeam, removeTeamMember, revokeTeamInvite, updateTeamMemberRole } from "@/lib/api/team.functions";

export const Route = createFileRoute("/dashboard/equipo")({
  head: () => ({ meta: [{ title: "Equipo — Calendya" }] }),
  component: TeamPage,
});

const selectClass = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50";

function TeamPage() {
  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader title="Equipo" description="Invita a tu staff y define qué puede hacer cada persona." />
      <PlanGate module="rolesPermissions">
        <TeamBody />
      </PlanGate>
    </div>
  );
}

function TeamBody() {
  const { data: business } = useMyBusiness();
  const qc = useQueryClient();
  const businessId = business?.id;

  const team = useQuery({
    queryKey: ["team", businessId],
    enabled: !!businessId,
    queryFn: () => listTeam({ data: { businessId: businessId! } }),
  });

  const pros = useQuery({
    queryKey: ["team-professionals", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("professionals")
        .select("id,name")
        .eq("business_id", businessId!)
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return data;
    },
  });
  const proName = (id: string | null) => pros.data?.find((p) => p.id === id)?.name ?? "—";

  const refresh = () => qc.invalidateQueries({ queryKey: ["team", businessId] });
  const onError = (e: Error) => toast.error(e.message);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AssignableRole>("reception");
  const [professionalId, setProfessionalId] = useState("");

  const invite = useMutation({
    mutationFn: () =>
      inviteTeamMember({ data: { businessId: businessId!, email, role, professionalId: role === "professional" ? professionalId || null : null } }),
    onSuccess: ({ emailSent }) => {
      toast.success(emailSent ? "Invitación enviada por email" : "Invitación creada. No pudimos enviar el email: pídele que se registre con ese correo.");
      setEmail("");
      setProfessionalId("");
      refresh();
    },
    onError,
  });

  const changeRole = useMutation({
    mutationFn: (v: { userId: string; role: AssignableRole; professionalId: string | null }) =>
      updateTeamMemberRole({ data: { businessId: businessId!, ...v } }),
    onSuccess: () => { toast.success("Rol actualizado"); refresh(); },
    onError,
  });
  const remove = useMutation({
    mutationFn: (userId: string) => removeTeamMember({ data: { businessId: businessId!, userId } }),
    onSuccess: () => { toast.success("Persona eliminada del equipo"); refresh(); },
    onError,
  });
  const revoke = useMutation({
    mutationFn: (inviteId: string) => revokeTeamInvite({ data: { businessId: businessId!, inviteId } }),
    onSuccess: () => { toast.success("Invitación cancelada"); refresh(); },
    onError,
  });

  const needsPro = role === "professional";
  const canInvite = !!email.trim() && (!needsPro || !!professionalId) && !invite.isPending;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><UserPlus className="size-4" /> Invitar a una persona</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="inv-email">Email</Label>
              <Input id="inv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="persona@correo.com" className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="inv-role">Rol</Label>
              <select id="inv-role" value={role} onChange={(e) => setRole(e.target.value as AssignableRole)} className={`${selectClass} mt-1.5`}>
                {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
            </div>
          </div>
          {needsPro && (
            <div>
              <Label htmlFor="inv-pro">Profesional asociado</Label>
              <select id="inv-pro" value={professionalId} onChange={(e) => setProfessionalId(e.target.value)} className={`${selectClass} mt-1.5`}>
                <option value="">Elige un profesional…</option>
                {pros.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}
          <p className="text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[role]}</p>
          <p className="text-xs text-muted-foreground">La persona debe registrarse o iniciar sesión con ese mismo email para aceptar la invitación.</p>
          <Button onClick={() => invite.mutate()} disabled={!canInvite}>{invite.isPending ? "Enviando…" : "Enviar invitación"}</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Personas en tu equipo</CardTitle></CardHeader>
        <CardContent>
          {team.isLoading && <BlockSkeleton className="h-16 w-full" />}
          {team.error && <p className="text-sm text-destructive">{(team.error as Error).message}</p>}
          {team.data && team.data.members.length === 0 && <p className="text-sm text-muted-foreground">Aún no hay nadie. Invita a tu primera persona arriba.</p>}
          <ul className="divide-y divide-border">
            {team.data?.members.map((m) => (
              <li key={m.userId} className="py-3 flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{m.email ?? "Usuario"}</p>
                  {m.role === "professional" && <p className="text-xs text-muted-foreground">Profesional: {proName(m.professionalId)}</p>}
                </div>
                <select
                  aria-label={`Rol de ${m.email ?? "usuario"}`}
                  value={m.role}
                  disabled={changeRole.isPending}
                  onChange={(e) => {
                    const next = e.target.value as AssignableRole;
                    if (next === "professional") {
                      const pid = m.professionalId ?? pros.data?.[0]?.id ?? null;
                      if (!pid) return toast.error("Primero crea un profesional para asociarlo.");
                      changeRole.mutate({ userId: m.userId, role: next, professionalId: pid });
                    } else {
                      changeRole.mutate({ userId: m.userId, role: next, professionalId: null });
                    }
                  }}
                  className={`${selectClass} !w-44`}
                >
                  {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Quitar a ${m.email ?? "usuario"}`}
                  disabled={remove.isPending}
                  onClick={() => { if (window.confirm(`¿Quitar a ${m.email ?? "esta persona"} del equipo? Perderá el acceso de inmediato.`)) remove.mutate(m.userId); }}
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {!!team.data?.invites.length && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Mail className="size-4" /> Invitaciones pendientes</CardTitle></CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {team.data.invites.map((i) => (
                <li key={i.id} className="py-3 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{i.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {ROLE_LABELS[i.role]}{i.role === "professional" ? ` · ${proName(i.professionalId)}` : ""}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" disabled={revoke.isPending} onClick={() => revoke.mutate(i.id)}>Cancelar</Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
