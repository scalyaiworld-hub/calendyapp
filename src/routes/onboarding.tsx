import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useMyBusiness } from "@/lib/business";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/PhoneInput";
import { DEFAULT_COUNTRY_CODE } from "@/lib/countries";
import { INDUSTRIES, SERVICE_TEMPLATES, type Industry } from "@/lib/service-templates";
import { formatPriceCents, slugify } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Check, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/onboarding")({
  head: () => ({ meta: [{ title: "Configura tu salón — AutoCitas" }] }),
  component: OnboardingPage,
});

function OnboardingPage() {
  const { user, loading, signOut } = useAuth();
  const { data: business, isLoading: bizLoading } = useMyBusiness();
  const navigate = useNavigate();
  const qc = useQueryClient();

  // Redirect away if not logged in or already done
  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", replace: true });
  }, [user, loading, navigate]);
  useEffect(() => {
    if (business?.onboarding_completed) navigate({ to: "/dashboard", replace: true });
  }, [business, navigate]);

  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1 — WhatsApp
  const [countryCode, setCountryCode] = useState(DEFAULT_COUNTRY_CODE);
  const [waNumber, setWaNumber] = useState("");

  // Step 2 — Salón
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState<string>("");
  const [customIndustry, setCustomIndustry] = useState("");

  // Step 3 — Servicios
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Prefill from existing partial business
  useEffect(() => {
    if (!business) return;
    if (business.whatsapp_country_code) setCountryCode(business.whatsapp_country_code);
    if (business.whatsapp_number) setWaNumber(business.whatsapp_number);
    if (business.name) setName(business.name);
    if (business.industry) {
      const known = INDUSTRIES.some((i) => i.id === business.industry);
      if (known) {
        setIndustry(business.industry);
      } else {
        setIndustry("other");
        setCustomIndustry(business.industry);
      }
    }
    if (business.onboarding_step) setStep(Math.max(1, Math.min(3, business.onboarding_step)) as 1 | 2 | 3);
  }, [business]);

  const isKnownIndustry = industry && industry !== "other" && industry in SERVICE_TEMPLATES;
  const templates = useMemo(
    () => (isKnownIndustry ? SERVICE_TEMPLATES[industry as Industry] : []),
    [industry, isKnownIndustry]
  );

  const saveStep1 = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sin sesión");
      if (!waNumber.trim()) throw new Error("Ingresa tu número de WhatsApp");
      // Create or update business
      if (business) {
        const { error } = await supabase
          .from("businesses")
          .update({
            whatsapp_country_code: countryCode,
            whatsapp_number: waNumber.trim(),
            phone: `${countryCode} ${waNumber.trim()}`,
            onboarding_step: 2,
          })
          .eq("id", business.id);
        if (error) throw error;
      } else {
        // Placeholder slug; final slug set on step 2 when we have a name.
        const placeholder = `salon-${Math.random().toString(36).slice(2, 8)}`;
        const { error } = await supabase.from("businesses").insert({
          owner_id: user.id,
          name: placeholder,
          slug: placeholder,
          whatsapp_country_code: countryCode,
          whatsapp_number: waNumber.trim(),
          phone: `${countryCode} ${waNumber.trim()}`,
          onboarding_step: 2,
        });
        if (error) throw error;
      }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["my-business"] });
      setStep(2);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveStep2 = useMutation({
    mutationFn: async () => {
      if (!business) throw new Error("Falta el paso anterior");
      if (!name.trim()) throw new Error("Escribe el nombre del salón");
      if (!industry) throw new Error("Elige el rubro");
      const industryValue = industry === "other" ? customIndustry.trim() : industry;
      if (!industryValue) throw new Error("Escribe tu rubro");
      const baseSlug = slugify(name) || `salon-${Math.random().toString(36).slice(2, 7)}`;
      // Best-effort uniqueness: append short suffix if needed
      let slug = baseSlug;
      const { data: existing } = await supabase
        .from("businesses")
        .select("id")
        .eq("slug", slug)
        .neq("id", business.id)
        .maybeSingle();
      if (existing) slug = `${baseSlug}-${Math.random().toString(36).slice(2, 5)}`;

      const { error } = await supabase
        .from("businesses")
        .update({ name: name.trim(), slug, industry: industryValue, onboarding_step: 3 })
        .eq("id", business.id);
      if (error) throw error;

      // Default availability Mon-Sat 9-19 if none exist yet
      const { data: rules } = await supabase
        .from("availability_rules")
        .select("id")
        .eq("business_id", business.id)
        .limit(1);
      if (!rules?.length) {
        const insertRules = [1, 2, 3, 4, 5, 6].map((dow) => ({
          business_id: business.id,
          day_of_week: dow,
          start_time: "09:00",
          end_time: "19:00",
        }));
        await supabase.from("availability_rules").insert(insertRules);
      }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["my-business"] });
      setStep(3);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const finish = useMutation({
    mutationFn: async (opts: { withServices: boolean }) => {
      if (!business) throw new Error("Falta el paso anterior");
      if (opts.withServices && selected.size > 0 && industry) {
        const list = SERVICE_TEMPLATES[industry as Industry];
        const rows = Array.from(selected).map((nameKey, idx) => {
          const t = list.find((s) => s.name === nameKey)!;
          return {
            business_id: business.id,
            name: t.name,
            duration_minutes: t.duration_minutes,
            price_cents: t.price_cents,
            display_order: idx,
          };
        });
        const { error } = await supabase.from("services").insert(rows);
        if (error) throw error;
      }
      const { error } = await supabase
        .from("businesses")
        .update({ onboarding_completed: true, onboarding_step: 3 })
        .eq("id", business.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["my-business"] });
      toast.success("¡Listo! Bienvenido");
      navigate({ to: "/dashboard", replace: true });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (loading || bizLoading) return <div className="min-h-screen grid place-items-center text-muted-foreground">Cargando…</div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 px-4 py-8">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <span className="font-display text-xl gradient-rose-text">AutoCitas</span>
          <button onClick={signOut} className="text-xs text-muted-foreground hover:text-foreground">Cerrar sesión</button>
        </div>

        <Stepper current={step} />

        <div className="surface-elev rounded-2xl p-6 sm:p-8 shadow-rose mt-6">
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h2 className="font-display text-2xl">¿Cuál es tu WhatsApp?</h2>
                <p className="text-sm text-muted-foreground mt-1">Lo usarás para coordinar con tus clientes.</p>
              </div>
              <div>
                <Label>Número de WhatsApp</Label>
                <div className="mt-1.5">
                  <PhoneInput
                    countryCode={countryCode}
                    number={waNumber}
                    onCountryCodeChange={setCountryCode}
                    onNumberChange={setWaNumber}
                  />
                </div>
              </div>
              <Button className="w-full h-11" onClick={() => saveStep1.mutate()} disabled={!waNumber.trim() || saveStep1.isPending}>
                {saveStep1.isPending ? "Guardando…" : "Continuar"}
                <ChevronRight className="size-4" />
              </Button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h2 className="font-display text-2xl">¿Cómo se llama tu salón?</h2>
                <p className="text-sm text-muted-foreground mt-1">Y dinos a qué rubro pertenece.</p>
              </div>
              <div>
                <Label>Nombre del salón</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Spa Rosé" className="mt-1.5 h-11" />
                {name && (
                  <p className="text-xs text-muted-foreground mt-1.5">
                    Tu página: /b/{slugify(name)}
                  </p>
                )}
              </div>
              <div>
                <Label className="mb-2 block">Rubro</Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {INDUSTRIES.map((ind) => (
                    <button
                      key={ind.id}
                      type="button"
                      onClick={() => setIndustry(ind.id)}
                      className={cn(
                        "p-3 rounded-md border text-left transition-colors",
                        industry === ind.id ? "border-primary bg-primary/10" : "border-border hover:bg-accent"
                      )}
                    >
                      <div className="text-2xl">{ind.emoji}</div>
                      <p className="font-medium text-sm mt-1">{ind.label}</p>
                      <p className="text-xs text-muted-foreground">{ind.description}</p>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setIndustry("other")}
                    className={cn(
                      "p-3 rounded-md border text-left transition-colors",
                      industry === "other" ? "border-primary bg-primary/10" : "border-border hover:bg-accent"
                    )}
                  >
                    <div className="text-2xl">✨</div>
                    <p className="font-medium text-sm mt-1">Otro</p>
                    <p className="text-xs text-muted-foreground">Escribe tu rubro</p>
                  </button>
                </div>
                {industry === "other" && (
                  <Input
                    value={customIndustry}
                    onChange={(e) => setCustomIndustry(e.target.value)}
                    placeholder="Ej. Tatuajes, masajes, podología…"
                    className="mt-3 h-11"
                    autoFocus
                  />
                )}
              </div>
              <Button
                className="w-full h-11"
                onClick={() => saveStep2.mutate()}
                disabled={
                  !name.trim() ||
                  !industry ||
                  (industry === "other" && !customIndustry.trim()) ||
                  saveStep2.isPending
                }
              >
                {saveStep2.isPending ? "Guardando…" : "Continuar"}
                <ChevronRight className="size-4" />
              </Button>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <div>
                <h2 className="font-display text-2xl">Elige tus servicios</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Marca los que ofrezcas. Puedes editarlos después o saltar este paso.
                </p>
              </div>
              <div className="max-h-[50vh] overflow-y-auto space-y-2 pr-1">
                {templates.map((t) => {
                  const checked = selected.has(t.name);
                  return (
                    <button
                      key={t.name}
                      type="button"
                      onClick={() => {
                        const n = new Set(selected);
                        checked ? n.delete(t.name) : n.add(t.name);
                        setSelected(n);
                      }}
                      className={cn(
                        "w-full text-left p-3 rounded-md border flex items-center justify-between gap-3 transition-colors",
                        checked ? "border-primary bg-primary/5" : "border-border hover:bg-accent"
                      )}
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{t.name}</p>
                        <p className="text-xs text-muted-foreground">{t.duration_minutes} min · {formatPriceCents(t.price_cents)}</p>
                      </div>
                      <span className={cn("size-5 rounded border flex items-center justify-center shrink-0", checked ? "bg-primary border-primary text-primary-foreground" : "border-border")}>
                        {checked && <Check className="size-3.5" />}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 h-11" onClick={() => finish.mutate({ withServices: false })} disabled={finish.isPending}>
                  Omitir por ahora
                </Button>
                <Button className="flex-1 h-11" onClick={() => finish.mutate({ withServices: true })} disabled={finish.isPending}>
                  {finish.isPending ? "Creando…" : selected.size > 0 ? `Agregar ${selected.size} y terminar` : "Terminar"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stepper({ current }: { current: number }) {
  const steps = ["WhatsApp", "Salón", "Servicios"];
  return (
    <div className="flex items-center gap-2">
      {steps.map((label, i) => {
        const n = i + 1;
        const active = n === current;
        const done = n < current;
        return (
          <div key={label} className="flex-1 flex items-center gap-2">
            <div className={cn(
              "size-7 rounded-full grid place-items-center text-xs font-semibold shrink-0",
              done ? "bg-primary text-primary-foreground" : active ? "bg-primary/15 text-primary border border-primary" : "bg-muted text-muted-foreground"
            )}>
              {done ? <Check className="size-3.5" /> : n}
            </div>
            <span className={cn("text-xs font-medium hidden sm:inline", active ? "text-foreground" : "text-muted-foreground")}>{label}</span>
            {i < steps.length - 1 && <div className={cn("flex-1 h-px", done ? "bg-primary" : "bg-border")} />}
          </div>
        );
      })}
    </div>
  );
}