import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getAvailableSlots } from "@/lib/availability";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { formatPriceCents, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Check, ChevronLeft, MapPin, User2, Scissors } from "lucide-react";
import { PhoneInput } from "@/components/PhoneInput";
import { DEFAULT_COUNTRY_CODE } from "@/lib/countries";
import { BrandTheme } from "@/lib/brand-theme";

export const Route = createFileRoute("/b/$slug")({
  head: ({ params }) => ({ meta: [{ title: `Reservar — ${params.slug}` }] }),
  component: BookingPage,
});

type Step = "location" | "mode" | "pickPro" | "pickSvc" | "datetime" | "client" | "done";
type Mode = "pro" | "svc" | null;

function BookingPage() {
  const { slug } = Route.useParams();
  const [step, setStep] = useState<Step>("location");
  const [locationId, setLocationId] = useState<string>("");
  const [mode, setMode] = useState<Mode>(null);
  const [professionalId, setProfessionalId] = useState<string>("");
  const [serviceId, setServiceId] = useState<string>("");
  const [date, setDate] = useState<Date>(() => { const d = new Date(); d.setHours(0,0,0,0); return d; });
  const [slot, setSlot] = useState<{ starts_at: Date; ends_at: Date } | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [countryCode, setCountryCode] = useState(DEFAULT_COUNTRY_CODE);

  const { data: business, isLoading } = useQuery({
    queryKey: ["public-biz", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("businesses")
        .select("id,name,slug,timezone,logo_url,industry,created_at,brand_primary,brand_background,brand_font")
        .eq("slug", slug)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Step 1: Sucursales activas del negocio
  const { data: locations } = useQuery({
    queryKey: ["public-locations", business?.id],
    enabled: !!business?.id,
    queryFn: async () => (await supabase
      .from("locations")
      .select("id,business_id,name,address,is_active,created_at")
      .eq("business_id", business!.id)
      .is("deleted_at", null)
      .eq("is_active", true)
      .order("created_at")).data ?? [],
  });
  const location = locations?.find((l) => l.id === locationId);

  // Profesionales asignados a la sucursal
  const { data: locPros } = useQuery({
    queryKey: ["public-loc-pros", locationId],
    enabled: !!locationId,
    queryFn: async () => {
      const { data } = await supabase
        .from("location_professionals")
        .select("professional_id, professionals!inner(id,name,avatar_url,is_active,deleted_at)")
        .eq("location_id", locationId);
      return (data ?? [])
        .map((r: any) => r.professionals)
        .filter((p: any) => p && p.is_active && !p.deleted_at);
    },
  });

  // Servicios ofrecidos en la sucursal (por al menos un profesional asignado)
  const proIdsInLoc = (locPros ?? []).map((p: any) => p.id);
  const { data: locServices } = useQuery({
    queryKey: ["public-loc-services", locationId, proIdsInLoc.join(",")],
    enabled: !!locationId && proIdsInLoc.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("professional_services")
        .select("service_id, services!inner(id,name,description,duration_minutes,price_cents,display_order,is_active,deleted_at)")
        .in("professional_id", proIdsInLoc);
      const map = new Map<string, any>();
      (data ?? []).forEach((r: any) => {
        if (r.services && r.services.is_active && !r.services.deleted_at) map.set(r.services.id, r.services);
      });
      return Array.from(map.values()).sort((a, b) => a.display_order - b.display_order);
    },
  });

  // Servicios del profesional seleccionado
  const { data: proServices } = useQuery({
    queryKey: ["public-pro-services", professionalId],
    enabled: !!professionalId,
    queryFn: async () => {
      const { data } = await supabase
        .from("professional_services")
        .select("service_id, services!inner(id,name,description,duration_minutes,price_cents,display_order,is_active,deleted_at)")
        .eq("professional_id", professionalId);
      return (data ?? [])
        .map((r: any) => r.services)
        .filter((s: any) => s && s.is_active && !s.deleted_at)
        .sort((a: any, b: any) => a.display_order - b.display_order);
    },
  });

  // Profesionales que ofrecen el servicio seleccionado dentro de la sucursal
  const { data: svcPros } = useQuery({
    queryKey: ["public-svc-pros", serviceId, locationId],
    enabled: !!serviceId && !!locationId && proIdsInLoc.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("professional_services")
        .select("professional_id, professionals!inner(id,name,avatar_url,is_active,deleted_at)")
        .eq("service_id", serviceId)
        .in("professional_id", proIdsInLoc);
      return (data ?? [])
        .map((r: any) => r.professionals)
        .filter((p: any) => p && p.is_active && !p.deleted_at);
    },
  });

  // Servicio elegido (puede venir de cualquiera de las dos ramas)
  const allKnownServices = [...(locServices ?? []), ...(proServices ?? [])];
  const service = allKnownServices.find((s: any) => s.id === serviceId);

  const { data: slots } = useQuery({
    queryKey: ["slots", business?.id, serviceId, professionalId, locationId, date.toDateString()],
    enabled: !!business?.id && !!serviceId && !!professionalId && !!locationId,
    queryFn: () => getAvailableSlots({ businessId: business!.id, serviceId, date, locationId, professionalId }),
  });

  const book = useMutation({
    mutationFn: async () => {
      if (!business || !service || !slot) throw new Error("Faltan datos");
      await createPublicBooking({
        data: {
          businessId: business.id,
          serviceId: service.id,
          locationId: locationId ?? null,
          professionalId: professionalId ?? null,
          startsAt: slot.starts_at.toISOString(),
          endsAt: slot.ends_at.toISOString(),
          name,
          phone,
          countryCode,
        },
      });
    },
    onSuccess: () => setStep("done"),
    onError: (e: Error) => toast.error("No se pudo reservar: " + e.message),
  });

  if (isLoading) return <div className="min-h-screen grid place-items-center text-muted-foreground">Cargando…</div>;
  if (!business) return <div className="min-h-screen grid place-items-center text-muted-foreground">Salón no encontrado</div>;

  const next7 = Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()+i); return d; });
  const professional = (locPros ?? []).find((p: any) => p.id === professionalId);

  const goBack = () => {
    if (step === "mode") setStep("location");
    else if (step === "pickPro" || step === "pickSvc") setStep("mode");
    else if (step === "datetime") setStep(mode === "pro" ? "pickSvc" : "pickPro");
    else if (step === "client") setStep("datetime");
  };

  const resetAll = () => {
    setStep("location"); setLocationId(""); setMode(null);
    setProfessionalId(""); setServiceId(""); setSlot(null);
    setName(""); setPhone("");
  };

  const stepNum = step === "location" ? 1 : step === "mode" || step === "pickPro" || step === "pickSvc" ? 2 : step === "datetime" || step === "client" ? 3 : 3;

  return (
    <BrandTheme brand={business as any}>
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="max-w-2xl mx-auto px-4 py-6 text-center">
          <h1 className="font-display text-3xl gradient-rose-text">{business.name}</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {step !== "done" && (
          <div className="flex items-center justify-between">
            {step !== "location" ? (
              <button onClick={goBack} className="text-sm text-muted-foreground flex items-center gap-1">
                <ChevronLeft className="size-4" /> Atrás
              </button>
            ) : <span />}
            <span className="text-xs text-muted-foreground">Paso {stepNum} de 3</span>
          </div>
        )}

        {/* Step 1: Sucursal */}
        {step === "location" && (
          <>
            <h2 className="font-display text-2xl">Elige una sucursal</h2>
            {!locations?.length ? (
              <p className="text-muted-foreground">Este salón aún no tiene sucursales activas.</p>
            ) : (
              <div className="grid gap-3">
                {locations.map((l) => (
                  <button key={l.id} onClick={() => { setLocationId(l.id); setStep("mode"); }} className="text-left">
                    <Card className="hover:border-primary transition-colors">
                      <CardContent className="pt-4 pb-4 flex items-start gap-3">
                        <MapPin className="size-5 text-primary mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <p className="font-medium">{l.name}</p>
                          {l.address && <p className="text-sm text-muted-foreground">{l.address}</p>}
                        </div>
                      </CardContent>
                    </Card>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {/* Step 2: Mode */}
        {step === "mode" && (
          <>
            <h2 className="font-display text-2xl">¿Cómo prefieres reservar?</h2>
            <p className="text-sm text-muted-foreground">{location?.name}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <button onClick={() => { setMode("pro"); setStep("pickPro"); }} className="text-left">
                <Card className="hover:border-primary transition-colors h-full">
                  <CardContent className="pt-6 pb-6 text-center space-y-2">
                    <User2 className="size-8 text-primary mx-auto" />
                    <p className="font-medium">Por profesional</p>
                    <p className="text-xs text-muted-foreground">Elige primero a la persona y luego el servicio.</p>
                  </CardContent>
                </Card>
              </button>
              <button onClick={() => { setMode("svc"); setStep("pickSvc"); }} className="text-left">
                <Card className="hover:border-primary transition-colors h-full">
                  <CardContent className="pt-6 pb-6 text-center space-y-2">
                    <Scissors className="size-8 text-primary mx-auto" />
                    <p className="font-medium">Por servicio</p>
                    <p className="text-xs text-muted-foreground">Elige primero el servicio y luego al profesional.</p>
                  </CardContent>
                </Card>
              </button>
            </div>
          </>
        )}

        {/* Step 2b: Pick professional (mode = pro) */}
        {step === "pickPro" && (
          <>
            <h2 className="font-display text-2xl">{mode === "pro" ? "Elige un profesional" : "Elige un profesional"}</h2>
            {!locPros?.length && mode === "pro" && <p className="text-muted-foreground">No hay profesionales en esta sucursal.</p>}
            {mode === "svc" && !svcPros?.length && <p className="text-muted-foreground">Nadie ofrece este servicio en esta sucursal.</p>}
            <div className="grid gap-2">
              {(mode === "pro" ? locPros : svcPros)?.map((p: any) => (
                <button key={p.id} onClick={() => {
                  setProfessionalId(p.id);
                  if (mode === "pro") setStep("pickSvc");
                  else setStep("datetime");
                }} className="text-left">
                  <Card className="hover:border-primary transition-colors">
                    <CardContent className="pt-3 pb-3 flex items-center gap-3">
                      <div className="size-10 rounded-full bg-primary/10 grid place-items-center text-primary font-medium">
                        {p.name.charAt(0).toUpperCase()}
                      </div>
                      <p className="font-medium">{p.name}</p>
                    </CardContent>
                  </Card>
                </button>
              ))}
            </div>
          </>
        )}

        {/* Step 2b: Pick service */}
        {step === "pickSvc" && (
          <>
            <h2 className="font-display text-2xl">Elige un servicio</h2>
            {(() => {
              const list = mode === "pro" ? proServices : locServices;
              if (!list?.length) return <p className="text-muted-foreground">No hay servicios disponibles.</p>;
              return (
                <div className="grid gap-3">
                  {list.map((s: any) => (
                    <button key={s.id} onClick={() => {
                      setServiceId(s.id);
                      if (mode === "svc") setStep("pickPro");
                      else setStep("datetime");
                    }} className="text-left">
                      <Card className="hover:border-primary transition-colors">
                        <CardContent className="pt-4 pb-4 flex items-center justify-between">
                          <div>
                            <p className="font-medium">{s.name}</p>
                            <p className="text-sm text-muted-foreground">{s.duration_minutes} min{s.description ? ` · ${s.description}` : ""}</p>
                          </div>
                          <p className="font-semibold text-primary">{formatPriceCents(s.price_cents)}</p>
                        </CardContent>
                      </Card>
                    </button>
                  ))}
                </div>
              );
            })()}
          </>
        )}

        {step === "datetime" && service && (
          <>
            <Card><CardContent className="pt-4 pb-4 text-sm space-y-0.5">
              <p><strong>{location?.name}</strong></p>
              <p>{service.name} · {service.duration_minutes} min · {formatPriceCents(service.price_cents)}</p>
              <p className="text-muted-foreground">con {professional?.name}</p>
            </CardContent></Card>
            <div>
              <Label className="mb-2 block">Día</Label>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {next7.map((d) => (
                  <button key={d.toDateString()} onClick={() => setDate(d)} className={cn("flex-shrink-0 px-3 py-2 rounded-md border text-center min-w-16", d.toDateString() === date.toDateString() ? "border-primary bg-primary/10" : "border-border")}>
                    <p className="text-xs text-muted-foreground">{d.toLocaleDateString("es-PE", { weekday: "short" })}</p>
                    <p className="font-medium">{d.getDate()}</p>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label className="mb-2 block">Hora disponible</Label>
              {!slots ? <p className="text-sm text-muted-foreground">Cargando…</p> : !slots.length ? (
                <p className="text-sm text-muted-foreground">No hay horarios disponibles este día.</p>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {slots.map((s) => (
                    <button key={s.starts_at.toISOString()} onClick={() => { setSlot(s); setStep("client"); }} className="px-3 py-2 rounded-md border border-border hover:border-primary text-sm">
                      {formatTime(s.starts_at)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {step === "client" && slot && service && (
          <>
            <h2 className="font-display text-2xl">Tus datos</h2>
            <Card><CardContent className="pt-4 pb-4 text-sm">
              <p><strong>{service.name}</strong></p>
              <p className="text-muted-foreground">{location?.name} · con {professional?.name}</p>
              <p className="text-muted-foreground">{slot.starts_at.toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" })} · {formatTime(slot.starts_at)}</p>
            </CardContent></Card>
            <div className="space-y-3">
              <div><Label>Nombre</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div>
                <Label>WhatsApp</Label>
                <div className="mt-1.5">
                  <PhoneInput
                    countryCode={countryCode}
                    number={phone}
                    onCountryCodeChange={setCountryCode}
                    onNumberChange={setPhone}
                  />
                </div>
              </div>
              <Button className="w-full" onClick={() => book.mutate()} disabled={!name || !phone || book.isPending}>
                {book.isPending ? "Reservando…" : "Confirmar reserva"}
              </Button>
            </div>
          </>
        )}

        {step === "done" && (
          <div className="text-center space-y-4 py-8">
            <div className="size-16 rounded-full bg-primary/10 grid place-items-center mx-auto">
              <Check className="size-8 text-primary" />
            </div>
            <h2 className="font-display text-2xl">¡Reserva recibida!</h2>
            <p className="text-muted-foreground">El salón confirmará tu cita por WhatsApp en breve.</p>
            <Button variant="outline" onClick={resetAll}>Reservar otra cita</Button>
          </div>
        )}
      </main>
    </div>
    </BrandTheme>
  );
}