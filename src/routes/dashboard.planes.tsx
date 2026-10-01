import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMyBusiness } from "@/lib/business";
import { downgradeToFreePlan } from "@/lib/api/plan.functions";
import { submitUpgradeRequest } from "@/lib/api/upgrade.functions";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PLANS, MODULE_LABELS, getPlan, type PlanId } from "@/lib/plans";
import { Check, Lock, Crown, Sparkles, ArrowRight, CalendarDays, Building2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/dashboard/planes")({
  head: () => ({ meta: [{ title: "Planes — Calendya" }] }),
  component: PlanesPage,
});

const PLAN_PRICES: Record<PlanId, string> = { free: "$0", pro: "$29", studio: "$99" };
const PLAN_PERIODS: Record<PlanId, string> = { free: "/ mes", pro: "USD / mes", studio: "USD / mes" };
const PLAN_ORDER: PlanId[] = ["free", "pro", "studio"];

const BUSINESS_TYPES = [
  "Barbería",
  "Peluquería / Salón de belleza",
  "Spa / Centro de bienestar",
  "Estética / Tratamientos faciales",
  "Uñas / Manicura",
  "Depilación",
  "Tatuajes y piercings",
  "Masajes y terapias",
  "Consultorio médico",
  "Clínica dental",
  "Veterinaria",
  "Entrenamiento personal / Fitness",
  "Otro",
];

function PlanesPage() {
  const { data: business } = useMyBusiness();
  const qc = useQueryClient();
  const currentId = ((business as any)?.plan ?? "free") as PlanId;
  const current = getPlan(currentId);
  const [requestPlan, setRequestPlan] = useState<PlanId | null>(null);

  const { data: usage } = useQuery({
    queryKey: ["plan-usage", business?.id],
    enabled: !!business?.id,
    queryFn: async () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const [appts, locs, pros] = await Promise.all([
        supabase.from("appointments").select("id", { count: "exact", head: true }).eq("business_id", business!.id).gte("starts_at", start.toISOString()).lt("starts_at", end.toISOString()).in("status", ["pending", "booked", "completed"]),
        supabase.from("locations").select("id", { count: "exact", head: true }).eq("business_id", business!.id).is("deleted_at", null).eq("is_active", true),
        supabase.from("professionals").select("id", { count: "exact", head: true }).eq("business_id", business!.id).is("deleted_at", null).eq("is_active", true),
      ]);
      return { appts: appts.count ?? 0, locs: locs.count ?? 0, pros: pros.count ?? 0 };
    },
  });

  const changePlan = useMutation({
    mutationFn: async (planId: PlanId) => {
      if (!business) throw new Error("Sin negocio");
      // El plan ya no se escribe desde el navegador: solo se puede bajar a Free.
      // Los planes de pago se activan desde el servidor tras la solicitud.
      if (planId !== "free") throw new Error("Los planes de pago se activan al enviar la solicitud.");
      await downgradeToFreePlan({ data: { businessId: business.id } });
      return planId;
    },
    onSuccess: (planId) => {
      toast.success(planId === "free" ? "Cambiaste al plan Free." : "Solicitud enviada. Te contactaremos para activar el plan.");
      qc.invalidateQueries({ queryKey: ["my-business"] });
      qc.invalidateQueries({ queryKey: ["plan-usage"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo actualizar el plan"),
  });

  return (
    <div>
      <PageHeader
        eyebrow="Tu cuenta"
        title="Planes"
        description="Elige el plan que mejor se ajusta a tu negocio. Cambia o cancela cuando quieras."
      />

      {/* Current usage */}
      <Card className="mb-8">
        <CardContent className="pt-6">
          <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
            <div className="flex items-center gap-3">
              <div className={cn(
                "size-10 rounded-lg grid place-items-center shrink-0",
                current.id === "studio" ? "bg-foreground text-background" : current.id === "pro" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
              )}>
                {current.id === "studio" ? <Crown className="size-5" /> : current.id === "pro" ? <Sparkles className="size-5" /> : <Lock className="size-5" />}
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Plan actual</p>
                <p className="font-display text-2xl tracking-tight">{current.label}</p>
              </div>
            </div>
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            <UsageRow icon={CalendarDays} label="Citas este mes" used={usage?.appts ?? 0} limit={current.limits.appointmentsPerMonth} />
            <UsageRow icon={Building2} label="Sucursales activas" used={usage?.locs ?? 0} limit={current.limits.locations} />
            <UsageRow icon={Users} label="Profesionales activos" used={usage?.pros ?? 0} limit={current.limits.professionals} />
          </div>
        </CardContent>
      </Card>

      {/* Plans grid */}
      <div className="grid md:grid-cols-3 gap-4 items-stretch">
        {PLAN_ORDER.map((id) => {
          const p = PLANS[id];
          const isCurrent = id === currentId;
          const isDowngrade = PLAN_ORDER.indexOf(id) < PLAN_ORDER.indexOf(currentId);
          const moduleKeys = Object.keys(p.modules) as (keyof typeof p.modules)[];
          const handleSelect = () => {
            if (isCurrent) return;
            if (id === "free") {
              if (confirm("¿Bajar al plan Free? Perderás los módulos del plan actual.")) {
                changePlan.mutate("free");
              }
              return;
            }
            setRequestPlan(id);
          };
          return (
            <Card
              key={id}
              role={isCurrent ? undefined : "button"}
              tabIndex={isCurrent ? undefined : 0}
              aria-label={isCurrent ? undefined : `Seleccionar plan ${p.label}`}
              onClick={handleSelect}
              onKeyDown={(e) => {
                if (isCurrent) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleSelect();
                }
              }}
              className={cn(
                "flex flex-col transition-all",
                !isCurrent && "cursor-pointer hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                id === "pro" && "border-primary/40 shadow-soft",
                id === "studio" && "bg-foreground text-background border-foreground",
                isCurrent && "ring-2 ring-primary/40",
              )}
            >
              <CardContent className="pt-6 flex flex-col flex-1">
                <div className="flex items-baseline justify-between mb-1">
                  <p className="font-display text-xl font-semibold">{p.label}</p>
                  {isCurrent && (
                    <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider", id === "studio" ? "bg-background/15 text-background" : "bg-primary/15 text-primary")}>Actual</span>
                  )}
                </div>
                <p className={cn("text-sm mb-4", id === "studio" ? "text-background/70" : "text-muted-foreground")}>{p.tagline}</p>
                <div className="flex items-baseline gap-1 mb-5">
                  <span className="font-display text-3xl tracking-tight">{PLAN_PRICES[id]}</span>
                  <span className={cn("text-xs", id === "studio" ? "text-background/60" : "text-muted-foreground")}>{PLAN_PERIODS[id]}</span>
                </div>

                <ul className="space-y-2 mb-6 text-sm">
                  <li className="flex items-start gap-2">
                    <Check className={cn("size-4 mt-0.5 shrink-0", id === "studio" ? "text-background" : "text-primary")} strokeWidth={2.25} />
                    <span>
                      {p.limits.appointmentsPerMonth === null ? "Citas ilimitadas" : `Hasta ${p.limits.appointmentsPerMonth} citas/mes`}
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className={cn("size-4 mt-0.5 shrink-0", id === "studio" ? "text-background" : "text-primary")} strokeWidth={2.25} />
                    <span>
                      {p.limits.locations === null ? "Sucursales ilimitadas" : `${p.limits.locations} ${p.limits.locations === 1 ? "sucursal" : "sucursales"}`}
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className={cn("size-4 mt-0.5 shrink-0", id === "studio" ? "text-background" : "text-primary")} strokeWidth={2.25} />
                    <span>
                      {p.limits.professionals === null ? "Profesionales ilimitados" : `Hasta ${p.limits.professionals} profesionales`}
                    </span>
                  </li>
                  {moduleKeys.map((k) => {
                    const on = p.modules[k];
                    return (
                      <li key={k} className={cn("flex items-start gap-2", !on && (id === "studio" ? "text-background/40" : "text-muted-foreground/60"))}>
                        {on ? (
                          <Check className={cn("size-4 mt-0.5 shrink-0", id === "studio" ? "text-background" : "text-primary")} strokeWidth={2.25} />
                        ) : (
                          <Lock className="size-3.5 mt-1 shrink-0 opacity-60" strokeWidth={1.75} />
                        )}
                        <span className={cn(!on && "line-through decoration-current/30")}>{MODULE_LABELS[k]}</span>
                      </li>
                    );
                  })}
                </ul>

                <div className="mt-auto">
                  {isCurrent ? (
                    <Button variant="outline" className={cn("w-full", id === "studio" && "bg-background/10 text-background border-background/20 hover:bg-background/20")} disabled>
                      Plan actual
                    </Button>
                  ) : id === "free" ? (
                    <Button
                      variant="outline"
                      className="w-full"
                      disabled={changePlan.isPending}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm("¿Bajar al plan Free? Perderás los módulos del plan actual.")) {
                          changePlan.mutate("free");
                        }
                      }}
                    >
                      {isDowngrade ? "Bajar a Free" : "Usar Free"}
                    </Button>
                  ) : (
                    <Button
                      className={cn("w-full", id === "studio" ? "bg-background text-foreground hover:bg-background/90" : "")}
                      onClick={(e) => {
                        e.stopPropagation();
                        setRequestPlan(id);
                      }}
                    >
                      {id === "studio"
                        ? "Hablar con ventas"
                        : isDowngrade
                          ? "Cambiar a " + p.label
                          : "Mejorar a " + p.label} <ArrowRight className="size-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground text-center mt-6">
        ¿Dudas sobre qué plan elegir? <Link to="/" hash="pricing" className="underline hover:text-foreground">Compara todos los planes</Link>.
      </p>

      <UpgradeRequestDialog
        planId={requestPlan === "studio" ? null : requestPlan}
        onClose={() => setRequestPlan(null)}
        businessName={(business as any)?.name ?? ""}
        businessId={business?.id}
      />
      <StudioRequestDialog
        open={requestPlan === "studio"}
        onClose={() => setRequestPlan(null)}
        businessName={(business as any)?.name ?? ""}
        businessId={business?.id}
        currentLocations={usage?.locs ?? 0}
        currentPros={usage?.pros ?? 0}
      />
    </div>
  );
}

function UpgradeRequestDialog({ planId, onClose, businessName, businessId }: { planId: PlanId | null; onClose: () => void; businessName: string; businessId?: string }) {
  const open = planId !== null;
  const plan = planId ? getPlan(planId) : null;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [industry, setIndustry] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setName(""); setEmail(""); setPhone(""); setIndustry(""); setMessage(""); setSubmitting(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    if (trimmedName.length < 2) return toast.error("Ingresa tu nombre");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) return toast.error("Ingresa un email válido");
    if (!industry) return toast.error("Cuéntanos qué tipo de negocio tienes");
    if (!businessId || !planId || planId === "free") return toast.error("No se encontró tu negocio");
    setSubmitting(true);
    try {
      await submitUpgradeRequest({
        data: {
          businessId,
          plan: planId as "pro" | "studio",
          name: trimmedName,
          email: trimmedEmail,
          phone: phone.trim() || undefined,
          industry,
          message: message.trim() || undefined,
        },
      });
      toast.success("¡Solicitud recibida! Te contactaremos en menos de 24 horas.");
      reset();
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "No se pudo enviar la solicitud");
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Solicitar plan {plan?.label ?? ""}</DialogTitle>
          <DialogDescription>
            Déjanos tus datos y un asesor te contactará para activar tu plan y resolver cualquier duda.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="up-name">Nombre completo</Label>
            <Input id="up-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="up-email">Email</Label>
            <Input id="up-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={255} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="up-phone">Teléfono (opcional)</Label>
            <Input id="up-phone" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="up-industry">¿Qué tipo de negocio tienes?</Label>
            <select
              id="up-industry"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              required
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Selecciona una opción</option>
              {BUSINESS_TYPES.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="up-msg">¿Algo que debamos saber? (opcional)</Label>
            <Textarea id="up-msg" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={500} rows={3} placeholder={`Negocio: ${businessName}`} />
          </div>
          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => { reset(); onClose(); }} disabled={submitting}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Enviando..." : "Enviar solicitud"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function UsageRow({ icon: Icon, label, used, limit }: { icon: any; label: string; used: number; limit: number | null }) {
  const isUnlimited = limit === null;
  const pct = isUnlimited ? 0 : Math.min(100, Math.round((used / Math.max(1, limit!)) * 100));
  const reached = !isUnlimited && used >= (limit ?? 0);
  const warn = !isUnlimited && pct >= 80 && !reached;
  return (
    <div className="rounded-lg border border-border p-3 bg-background/40">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
          <Icon className="size-3.5" strokeWidth={1.75} /> {label}
        </div>
        <p className="font-display text-sm tabular-nums">
          {used}<span className="text-muted-foreground">/{isUnlimited ? "∞" : limit}</span>
        </p>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full transition-all", isUnlimited ? "bg-primary/40 w-full" : reached ? "bg-rose-500" : warn ? "bg-amber-500" : "bg-primary")}
          style={isUnlimited ? undefined : { width: `${pct}%` }}
        />
      </div>
      {reached && <p className="text-[11px] text-rose-600 mt-1.5">Límite alcanzado</p>}
      {warn && <p className="text-[11px] text-amber-600 mt-1.5">Cerca del límite</p>}
    </div>
  );
}

function StudioRequestDialog({
  open,
  onClose,
  businessName,
  businessId,
  currentLocations,
  currentPros,
}: {
  open: boolean;
  onClose: () => void;
  businessName: string;
  businessId?: string;
  currentLocations: number;
  currentPros: number;
}) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [locations, setLocations] = useState<string>("");
  const [team, setTeam] = useState<string>("");
  const [industry, setIndustry] = useState<string>("");
  const [appointmentsRange, setAppointmentsRange] = useState<string>("");
  const [currentTool, setCurrentTool] = useState("");
  const [timing, setTiming] = useState<string>("");
  const [needs, setNeeds] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setName(""); setRole(""); setEmail(""); setPhone("");
    setLocations(""); setTeam(""); setIndustry(""); setAppointmentsRange("");
    setCurrentTool(""); setTiming(""); setNeeds("");
    setSubmitting(false);
  };

  // Prefill con los datos actuales del negocio cuando se abre.
  useEffect(() => {
    if (!open) return;
    if (currentLocations > 0) setLocations((v) => v || String(currentLocations));
    if (currentPros > 0) setTeam((v) => v || String(currentPros));
  }, [open, currentLocations, currentPros]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) return toast.error("Ingresa tu nombre");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return toast.error("Ingresa un email válido");
    if (!industry) return toast.error("Cuéntanos qué tipo de negocio tienes");
    if (!timing) return toast.error("Indica cuándo te gustaría empezar");
    if (!businessId) return toast.error("No se encontró tu negocio");
    setSubmitting(true);
    try {
      const details: Record<string, string> = {};
      if (role.trim()) details.role = role.trim();
      if (locations) details.locations = locations;
      if (team) details.team = team;
      if (appointmentsRange) details.appointmentsRange = appointmentsRange;
      if (currentTool.trim()) details.currentTool = currentTool.trim();
      details.timing = timing;
      await submitUpgradeRequest({
        data: {
          businessId,
          plan: "studio",
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          industry,
          message: needs.trim() || undefined,
          details,
        },
      });
      toast.success("¡Recibido! Un asesor Studio te contactará en menos de 24 h.");
      reset();
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "No se pudo enviar la solicitud");
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-lg bg-foreground text-background grid place-items-center">
              <Crown className="size-4" />
            </div>
            <DialogTitle>Hablemos del plan Studio</DialogTitle>
          </div>
          <DialogDescription>
            Te armamos una propuesta a medida: sucursales ilimitadas, equipo grande, onboarding asistido y soporte prioritario.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="st-name">Nombre completo *</Label>
              <Input id="st-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="st-role">Cargo en el negocio</Label>
              <Input id="st-role" value={role} onChange={(e) => setRole(e.target.value)} maxLength={80} placeholder="Dueño, gerente, etc." />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="st-email">Email corporativo *</Label>
              <Input id="st-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={255} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="st-phone">Teléfono / WhatsApp</Label>
              <Input id="st-phone" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} />
            </div>
          </div>

          <div className="rounded-lg border border-border p-3 bg-muted/30 space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Sobre tu operación</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="st-industry">¿Qué tipo de negocio tienes? *</Label>
                <select
                  id="st-industry"
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  required
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Selecciona una opción</option>
                  {BUSINESS_TYPES.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="st-locs">Sucursales</Label>
                <Input id="st-locs" type="number" min={1} value={locations} onChange={(e) => setLocations(e.target.value)} placeholder="ej. 4" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="st-team">Tamaño del equipo</Label>
                <Input id="st-team" type="number" min={1} value={team} onChange={(e) => setTeam(e.target.value)} placeholder="ej. 12 profesionales" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="st-vol">Citas estimadas por mes</Label>
                <select
                  id="st-vol"
                  value={appointmentsRange}
                  onChange={(e) => setAppointmentsRange(e.target.value)}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Selecciona un rango</option>
                  <option value="<500">Menos de 500</option>
                  <option value="500-2000">500 – 2.000</option>
                  <option value="2000-5000">2.000 – 5.000</option>
                  <option value=">5000">Más de 5.000</option>
                </select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="st-tool">¿Qué herramienta usan hoy? (opcional)</Label>
                <Input id="st-tool" value={currentTool} onChange={(e) => setCurrentTool(e.target.value)} maxLength={120} placeholder="Excel, Booksy, agenda en papel…" />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="st-time">¿Cuándo te gustaría empezar? *</Label>
            <select
              id="st-time"
              value={timing}
              onChange={(e) => setTiming(e.target.value)}
              required
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Selecciona</option>
              <option value="asap">Lo antes posible</option>
              <option value="1m">Próximo mes</option>
              <option value="3m">Próximos 3 meses</option>
              <option value="explore">Solo estoy explorando</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="st-needs">Necesidades específicas (opcional)</Label>
            <Textarea
              id="st-needs"
              value={needs}
              onChange={(e) => setNeeds(e.target.value)}
              maxLength={800}
              rows={3}
              placeholder={`Negocio: ${businessName}. Ej. integraciones, reportes por sucursal, facturación…`}
            />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => { reset(); onClose(); }} disabled={submitting}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting} className="bg-foreground text-background hover:bg-foreground/90">
              {submitting ? "Enviando…" : "Solicitar contacto Studio"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}