import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMyBusiness } from "@/lib/business";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { PhoneInput } from "@/components/PhoneInput";
import { DEFAULT_COUNTRY_CODE } from "@/lib/countries";
import { AVAILABLE_FONTS, BrandTheme } from "@/lib/brand-theme";
import { slugify } from "@/lib/format";
import { useEntityCounts } from "@/lib/entity-counts";
import { hasModule } from "@/lib/plans";
import { translateDbError } from "@/lib/api/error-messages";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/ajustes")({
  component: AjustesPage,
});

function AjustesPage() {
  const { data: business } = useMyBusiness();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [waCountry, setWaCountry] = useState(DEFAULT_COUNTRY_CODE);
  const [waNumber, setWaNumber] = useState("");
  const [brandPrimary, setBrandPrimary] = useState<string>("#3b82f6");
  const [brandBackground, setBrandBackground] = useState<string>("#fafbfc");
  const [brandFont, setBrandFont] = useState<string>("Inter");

  // Only prefill once so background refetches don't overwrite the user's edits.
  const prefilledRef = useRef(false);
  useEffect(() => {
    if (business && !prefilledRef.current) {
      prefilledRef.current = true;
      setName(business.name);
      setSlug(business.slug);
      setWaCountry((business as any).whatsapp_country_code ?? DEFAULT_COUNTRY_CODE);
      setWaNumber((business as any).whatsapp_number ?? business.phone ?? "");
      setBrandPrimary((business as any).brand_primary ?? "#3b82f6");
      setBrandBackground((business as any).brand_background ?? "#fafbfc");
      setBrandFont((business as any).brand_font ?? "Inter");
    }
  }, [business]);

  // Auto-sugerir slug a partir del nombre mientras el usuario no lo edite manualmente.
  useEffect(() => {
    if (!slugTouched && name) {
      const next = slugify(name);
      if (next && next.length >= 3) setSlug(next);
    }
  }, [name, slugTouched]);

  const save = useMutation({
    mutationFn: async () => {
      const cleanSlug = slug.trim().toLowerCase();
      if (!/^[a-z0-9-]+$/.test(cleanSlug) || cleanSlug.length < 3 || cleanSlug.length > 60) {
        throw new Error("El link debe tener entre 3 y 60 caracteres: letras, números y guiones.");
      }
      if (cleanSlug !== business!.slug) {
        const { data: available, error: slugErr } = await supabase.rpc("is_slug_available", {
          _slug: cleanSlug,
          _exclude_id: business!.id,
        });
        if (slugErr) throw slugErr;
        if (!available) throw new Error("Ese link ya está en uso. Elige otro.");
      }
      const { error } = await supabase
        .from("businesses")
        .update({
          name,
          slug: cleanSlug,
          whatsapp_country_code: waCountry,
          whatsapp_number: waNumber || null,
          phone: waNumber ? `${waCountry} ${waNumber}` : null,
        })
        .eq("id", business!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-business"] });
      toast.success("Guardado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveBrand = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("businesses")
        .update({
          brand_primary: brandPrimary,
          brand_background: brandBackground,
          brand_font: brandFont,
        } as any)
        .eq("id", business!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-business"] });
      toast.success("Tema guardado");
    },
    onError: (e: Error) => toast.error(translateDbError(e)),
  });

  // Reglas de reserva (por negocio)
  const [lead, setLead] = useState("30");
  const [ahead, setAhead] = useState("90");
  const [step, setStep] = useState("duration");
  const [buffer, setBuffer] = useState("0");
  const [cancelHours, setCancelHours] = useState("2");
  const [maxNoShows, setMaxNoShows] = useState("");
  useEffect(() => {
    if (!business) return;
    const b = business as any;
    setLead(String(b.booking_min_lead_minutes ?? 30));
    setAhead(String(b.booking_max_ahead_days ?? 90));
    setStep(b.booking_slot_step_minutes ? String(b.booking_slot_step_minutes) : "duration");
    setBuffer(String(b.booking_buffer_minutes ?? 0));
    setCancelHours(String(b.booking_cancel_min_hours ?? 2));
    setMaxNoShows(b.booking_max_no_shows ? String(b.booking_max_no_shows) : "");
  }, [business?.id]);

  const saveRules = useMutation({
    mutationFn: async () => {
      const num = (v: string, min: number, max: number, label: string) => {
        const n = Number(v);
        if (!Number.isInteger(n) || n < min || n > max)
          throw new Error(`${label}: indica un número entre ${min} y ${max}.`);
        return n;
      };
      const noShows =
        maxNoShows.trim() === "" ? null : num(maxNoShows, 1, 50, "Límite de no-shows");
      const { error } = await supabase
        .from("businesses")
        .update({
          booking_min_lead_minutes: num(lead, 0, 1440, "Anticipación mínima"),
          booking_max_ahead_days: num(ahead, 1, 365, "Reserva máxima"),
          booking_slot_step_minutes: step === "duration" ? null : Number(step),
          booking_buffer_minutes: num(buffer, 0, 120, "Margen entre citas"),
          booking_cancel_min_hours: num(cancelHours, 0, 168, "Cancelación del cliente"),
          booking_max_no_shows: noShows,
        } as any)
        .eq("id", business!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-business"] });
      toast.success("Reglas de reserva guardadas");
    },
    onError: (e: Error) => toast.error(translateDbError(e)),
  });

  const resetBrand = () => {
    setBrandPrimary("#3b82f6");
    setBrandBackground("#fafbfc");
    setBrandFont("Inter");
  };

  const { data: entityCounts } = useEntityCounts(business?.id);
  const prosCount = entityCounts?.pros ?? 0;
  const servicesCount = entityCounts?.services ?? 0;
  const locationsCount = entityCounts?.locations ?? 0;

  if (!business) return <p className="text-muted-foreground">Primero crea tu salón.</p>;

  const hasPros = prosCount > 0;
  const hasServices = servicesCount > 0;
  const hasLocations = locationsCount > 0;
  const canShare = hasPros && hasServices && hasLocations;
  const missing: string[] = [];
  if (!hasLocations) missing.push("una sucursal");
  if (!hasPros) missing.push("un profesional");
  if (!hasServices) missing.push("un servicio");
  const canBrand = hasModule((business as any).plan, "branding");
  const missingMsg = `Agrega al menos ${missing.join(", ")} para activar el link de reservas.`;
  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/b/${business.slug}`
      : `/b/${business.slug}`;

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h1 className="font-display text-3xl mb-1">Ajustes</h1>
        <p className="text-muted-foreground">Información de tu salón.</p>
      </div>
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div>
            <Label>Nombre</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Link público</Label>
            <div className="flex items-center gap-1 mt-1.5">
              <span className="text-sm text-muted-foreground shrink-0">
                {typeof window !== "undefined" ? `${window.location.origin}/b/` : "/b/"}
              </span>
              <Input
                value={slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(e.target.value.toLowerCase().replace(/\s+/g, "-"));
                }}
                placeholder="mi-salon"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {slug !== business.slug
                ? "⚠️ Al guardar, el link anterior dejará de funcionar. Comparte el nuevo con tus clientes."
                : "Se sugiere automáticamente desde el nombre. Puedes editarlo."}
            </p>
          </div>
          <div>
            <Label>WhatsApp</Label>
            <div className="mt-1.5">
              <PhoneInput
                countryCode={waCountry}
                number={waNumber}
                onCountryCodeChange={setWaCountry}
                onNumberChange={setWaNumber}
              />
            </div>
          </div>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !name}>
            Guardar
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div>
            <h2 className="font-display text-xl mb-1">Marca y apariencia</h2>
            <p className="text-sm text-muted-foreground">
              Personaliza los colores y la tipografía de tu panel y de tu página pública de
              reservas.
            </p>
          </div>

          {!canBrand && (
            <p className="text-sm rounded-md border border-border bg-muted/50 px-3 py-2">
              La marca personalizada está disponible desde el plan Pro.{" "}
              <Link to="/dashboard/planes" className="underline font-medium">
                Ver planes
              </Link>
            </p>
          )}

          <fieldset disabled={!canBrand} className="space-y-4 disabled:opacity-60">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Color principal</Label>
                <div className="flex gap-2 mt-1.5">
                  <input
                    type="color"
                    value={brandPrimary}
                    onChange={(e) => setBrandPrimary(e.target.value)}
                    className="h-10 w-14 rounded border border-input cursor-pointer"
                  />
                  <Input
                    value={brandPrimary}
                    onChange={(e) => setBrandPrimary(e.target.value)}
                    placeholder="#3b82f6"
                  />
                </div>
              </div>
              <div>
                <Label>Color de fondo</Label>
                <div className="flex gap-2 mt-1.5">
                  <input
                    type="color"
                    value={brandBackground}
                    onChange={(e) => setBrandBackground(e.target.value)}
                    className="h-10 w-14 rounded border border-input cursor-pointer"
                  />
                  <Input
                    value={brandBackground}
                    onChange={(e) => setBrandBackground(e.target.value)}
                    placeholder="#fafbfc"
                  />
                </div>
              </div>
            </div>

            <div>
              <Label>Tipografía</Label>
              <select
                value={brandFont}
                onChange={(e) => setBrandFont(e.target.value)}
                className="mt-1.5 w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                style={{ fontFamily: `"${brandFont}"` }}
              >
                {AVAILABLE_FONTS.map((f) => (
                  <option key={f} value={f} style={{ fontFamily: `"${f}"` }}>
                    {f}
                  </option>
                ))}
              </select>
            </div>

            <BrandTheme
              brand={{
                brand_primary: brandPrimary,
                brand_background: brandBackground,
                brand_font: brandFont,
              }}
            >
              <div
                className="rounded-lg border border-border p-4"
                style={{ background: brandBackground, fontFamily: `"${brandFont}"` }}
              >
                <p className="text-xs text-muted-foreground mb-2">Vista previa</p>
                <h3 className="text-lg font-semibold mb-2" style={{ fontFamily: `"${brandFont}"` }}>
                  {name || "Tu negocio"}
                </h3>
                <Button style={{ background: brandPrimary, color: "white" }}>Reservar cita</Button>
              </div>
            </BrandTheme>

            <div className="flex gap-2">
              <Button
                onClick={() => saveBrand.mutate()}
                disabled={!canBrand || saveBrand.isPending}
              >
                Guardar tema
              </Button>
              <Button
                variant="outline"
                onClick={resetBrand}
                disabled={!canBrand || saveBrand.isPending}
              >
                Restablecer
              </Button>
            </div>
          </fieldset>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div>
            <h2 className="font-display text-xl mb-1">Reglas de reserva</h2>
            <p className="text-sm text-muted-foreground">
              Cómo reservan tus clientes desde tu página pública.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Anticipación mínima (min)</Label>
              <Input
                className="mt-1.5"
                inputMode="numeric"
                value={lead}
                onChange={(e) => setLead(e.target.value)}
              />
            </div>
            <div>
              <Label>Reservar hasta (días)</Label>
              <Input
                className="mt-1.5"
                inputMode="numeric"
                value={ahead}
                onChange={(e) => setAhead(e.target.value)}
              />
            </div>
            <div>
              <Label>Intervalo entre horarios</Label>
              <select
                value={step}
                onChange={(e) => setStep(e.target.value)}
                className="mt-1.5 w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="duration">Duración del servicio</option>
                {[10, 15, 20, 30, 60].map((m) => (
                  <option key={m} value={m}>
                    {m} min
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Margen entre citas (min)</Label>
              <Input
                className="mt-1.5"
                inputMode="numeric"
                value={buffer}
                onChange={(e) => setBuffer(e.target.value)}
              />
            </div>
            <div>
              <Label>El cliente puede cancelar hasta (h antes)</Label>
              <Input
                className="mt-1.5"
                inputMode="numeric"
                value={cancelHours}
                onChange={(e) => setCancelHours(e.target.value)}
              />
            </div>
            <div>
              <Label>Bloquear tras N no-shows</Label>
              <Input
                className="mt-1.5"
                inputMode="numeric"
                value={maxNoShows}
                onChange={(e) => setMaxNoShows(e.target.value)}
                placeholder="Sin límite"
              />
            </div>
          </div>
          <Button onClick={() => saveRules.mutate()} disabled={saveRules.isPending}>
            Guardar reglas
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 space-y-2">
          <Label>Tu página pública</Label>
          <div className="flex gap-2">
            <Input readOnly value={url} />
            <Button
              variant="outline"
              disabled={!canShare}
              onClick={() => {
                navigator.clipboard.writeText(url);
                toast.success("Copiado");
              }}
              title={canShare ? undefined : missingMsg}
            >
              Copiar
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {canShare
              ? "Comparte este enlace con tus clientes para que reserven solos."
              : missingMsg}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
