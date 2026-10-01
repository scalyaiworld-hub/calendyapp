import { createFileRoute, notFound } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { formatPriceCents, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Check, ChevronLeft, ChevronRight, MapPin, User2, Scissors, Calendar, Clock, Sparkles, Menu, X, Sun, Sunset, Moon, Phone, UserCircle2 } from "lucide-react";
import { PhoneInput } from "@/components/PhoneInput";
import { DEFAULT_COUNTRY_CODE } from "@/lib/countries";
import { createPublicBooking, getPublicBusinessBootstrap, getPublicSlots } from "@/lib/api/public-booking.functions";
import { Turnstile, TURNSTILE_SITE_KEY } from "@/components/Turnstile";
import { hourInTz } from "@/lib/tz";
import { BrandTheme } from "@/lib/brand-theme";

const bootstrapOptions = (slug: string) =>
  queryOptions({
    queryKey: ["public-booking-bootstrap", slug],
    queryFn: () => getPublicBusinessBootstrap({ data: { slug } }),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });

export const Route = createFileRoute("/b/$slug")({
  loader: async ({ params, context }) => {
    const data = await context.queryClient.ensureQueryData(bootstrapOptions(params.slug));
    if (!data?.business) throw notFound();
    return { businessName: data.business.name as string };
  },
  head: ({ loaderData, params }) => {
    const name = loaderData?.businessName ?? params.slug;
    const title = `Reservar en ${name} — Calendya`;
    const description = `Agenda tu cita en ${name} de forma rápida y online.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
      ],
    };
  },
  notFoundComponent: () => (
    <div className="min-h-screen grid place-items-center text-muted-foreground">Salón no encontrado</div>
  ),
  component: BookingPage,
});

function SummaryRow({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  const empty = value === "Por elegir" || value === "—";
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Icon className={cn("size-4 shrink-0", empty ? "text-muted-foreground/50" : "text-primary")} />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className={cn("text-sm truncate", empty ? "text-muted-foreground/70" : "font-medium text-foreground")}>{value}</p>
      </div>
    </div>
  );
}

function groupSlotsByPartOfDay(slots: { starts_at: Date; ends_at: Date }[], tz: string) {
  const groups: Record<"morning" | "afternoon" | "evening", typeof slots> = { morning: [], afternoon: [], evening: [] };
  slots.forEach((s) => {
    const h = hourInTz(s.starts_at, tz);
    if (h < 12) groups.morning.push(s);
    else if (h < 18) groups.afternoon.push(s);
    else groups.evening.push(s);
  });
  return groups;
}

function dateLabel(d: Date) {
  const today = new Date(); today.setHours(0,0,0,0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return "Hoy";
  if (diff === 1) return "Mañana";
  return d.toLocaleDateString("es-PE", { weekday: "short" });
}

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
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);
  const qc = useQueryClient();
  const captchaRequired = !!TURNSTILE_SITE_KEY;

  // Una sola carga: negocio + sucursales + profesionales + servicios + asignaciones.
  // Precargado en el loader → la página aparece sin "Cargando…" y sin cascada de queries.
  const { data: bootstrap } = useSuspenseQuery(bootstrapOptions(slug));
  const business = bootstrap.business!; // loader ya lanzó notFound si era null
  const locations = bootstrap.locations;
  const allPros = bootstrap.professionals;
  const allServices = bootstrap.services;
  const locationPros = bootstrap.locationPros;
  const proServicesMap = bootstrap.professionalServices;

  const location = locations.find((l: any) => l.id === locationId);
  const hasLocations = (locations?.length ?? 0) > 0;

  // Si el negocio no tiene sucursales, saltamos el paso de elegir sucursal.
  useEffect(() => {
    if (locations && !hasLocations && step === "location") setStep("mode");
  }, [locations, hasLocations, step]);

  // Derivaciones en memoria a partir del bootstrap (sin queries adicionales).
  // Profesionales por sucursal (con fallback a todos si no hay asignaciones).
  const locPros = (() => {
    if (!locationId) return allPros;
    const assignedIds = new Set(
      locationPros.filter((r: any) => r.location_id === locationId).map((r: any) => r.professional_id),
    );
    const assigned = allPros.filter((p: any) => assignedIds.has(p.id));
    return assigned.length > 0 ? assigned : allPros;
  })();
  const proIdsInLoc = locPros.map((p: any) => p.id);

  // Servicios ofrecidos en la sucursal (por al menos un profesional asignado).
  const locServices = (() => {
    if (proIdsInLoc.length === 0) return allServices;
    const allowed = new Set(proIdsInLoc);
    const svcIds = new Set(
      proServicesMap.filter((r: any) => allowed.has(r.professional_id)).map((r: any) => r.service_id),
    );
    const filtered = allServices.filter((s: any) => svcIds.has(s.id));
    return filtered.length > 0 ? filtered : allServices;
  })();

  // Servicios del profesional seleccionado.
  const proServices = (() => {
    if (!professionalId) return [];
    const svcIds = new Set(
      proServicesMap.filter((r: any) => r.professional_id === professionalId).map((r: any) => r.service_id),
    );
    const filtered = allServices.filter((s: any) => svcIds.has(s.id));
    return filtered.length > 0 ? filtered : allServices;
  })();

  // Profesionales que ofrecen el servicio seleccionado dentro de la sucursal.
  const svcPros = (() => {
    if (!serviceId) return locPros;
    const allowedPros = new Set(proIdsInLoc);
    const proIds = new Set(
      proServicesMap
        .filter((r: any) => r.service_id === serviceId && allowedPros.has(r.professional_id))
        .map((r: any) => r.professional_id),
    );
    const filtered = locPros.filter((p: any) => proIds.has(p.id));
    return filtered.length > 0 ? filtered : locPros;
  })();

  const service = allServices.find((s: any) => s.id === serviceId);

  // Los horarios los calcula el servidor (misma lógica que valida la reserva), en la zona del negocio.
  const tz = business.timezone ?? "America/Lima";
  const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const { data: slotsRes } = useQuery({
    queryKey: ["slots", business?.id, serviceId, professionalId, locationId, dateStr],
    enabled: !!business?.id && !!serviceId && !!professionalId,
    queryFn: () =>
      getPublicSlots({
        data: { businessId: business!.id, serviceId, date: dateStr, locationId: locationId || null, professionalId: professionalId || null },
      }),
    staleTime: 30_000,
  });
  const slots = slotsRes
    ? slotsRes.slots.map((s) => ({ starts_at: new Date(s.startsAt), ends_at: new Date(s.endsAt) }))
    : undefined;

  // Limpiar el horario seleccionado cuando cambian los criterios de búsqueda,
  // para que el botón "Siguiente" no avance con una hora que ya no aplica.
  useEffect(() => {
    setSlot(null);
  }, [serviceId, professionalId, locationId, date]);

  const book = useMutation({
    mutationFn: async () => {
      if (!business || !service || !slot) throw new Error("Faltan datos");
      await createPublicBooking({
        data: {
          businessId: business.id,
          serviceId: service.id,
          locationId: locationId || null,
          professionalId: professionalId || null,
          startsAt: slot.starts_at.toISOString(),
          endsAt: slot.ends_at.toISOString(),
          name,
          phone,
          countryCode,
          captchaToken: captchaToken ?? undefined,
        },
      });
    },
    onSuccess: () => setStep("done"),
    onError: (e: Error) => {
      toast.error("No se pudo reservar: " + e.message);
      // El token del captcha es de un solo uso y los horarios pueden haber cambiado.
      setCaptchaToken(null);
      setCaptchaKey((k) => k + 1);
      qc.invalidateQueries({ queryKey: ["slots"] });
    },
  });

  const next7 = Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()+i); return d; });
  const professional = locPros.find((p: any) => p.id === professionalId);

  const goBack = () => {
    if (step === "mode") setStep(hasLocations ? "location" : "mode");
    else if (step === "pickPro" || step === "pickSvc") setStep("mode");
    else if (step === "datetime") setStep(mode === "pro" ? "pickSvc" : "pickPro");
    else if (step === "client") setStep("datetime");
  };

  const resetAll = () => {
    setStep(hasLocations ? "location" : "mode"); setLocationId(""); setMode(null);
    setProfessionalId(""); setServiceId(""); setSlot(null);
    setName(""); setPhone(""); setCountryCode(DEFAULT_COUNTRY_CODE);
  };

  const stepIndex = step === "location" ? 0 : step === "mode" || step === "pickPro" || step === "pickSvc" ? 1 : step === "datetime" ? 2 : step === "client" ? 3 : 4;
  const totalSteps = 4;

  const stepLabels = ["Sucursal", "Profesional o servicio", "Día y hora", "Tus datos"];
  const stepDescriptions = [
    "Elige dónde atenderte",
    "Selecciona quién y qué",
    "Escoge la fecha",
    "Completa tus datos",
  ];

  const initials = business.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <BrandTheme brand={business as any}>
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      {/* Aside: Brand + resumen */}
      <aside className="bg-card border-b border-border lg:border-b-0 lg:border-r lg:min-h-screen lg:sticky lg:top-0">
        <div className="px-6 py-8 lg:px-10 lg:py-12 max-w-xl mx-auto lg:mx-0 lg:ml-auto lg:w-full lg:max-w-md space-y-8">
          <div className="flex items-center gap-4">
            {business.logo_url ? (
              <img
                src={business.logo_url}
                alt={business.name}
                width={56}
                height={56}
                decoding="async"
                // @ts-expect-error fetchpriority not in React types
                fetchpriority="high"
                className="size-14 rounded-2xl object-cover border border-border"
              />
            ) : (
              <div className="size-14 rounded-2xl bg-primary/10 grid place-items-center text-primary font-display text-xl">
                {initials}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Reservar online</p>
              <h1 className="font-display text-2xl gradient-rose-text truncate">{business.name}</h1>
            </div>
          </div>

          {step !== "done" ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Tu reserva</p>
                <button onClick={() => setSummaryOpen((v) => !v)} className="lg:hidden text-xs text-primary flex items-center gap-1 font-medium">
                  {summaryOpen ? <><X className="size-3" /> Ocultar</> : <><Menu className="size-3" /> Ver detalle</>}
                </button>
              </div>
              {/* Desktop / expanded mobile */}
              <div className={cn("rounded-2xl border border-border bg-background/50 divide-y divide-border", !summaryOpen && "hidden lg:block")}>
                <SummaryRow icon={MapPin} label="Sucursal" value={location?.name ?? (hasLocations ? "Por elegir" : "—")} />
                <SummaryRow icon={User2} label="Profesional" value={professional?.name ?? "Por elegir"} />
                <SummaryRow icon={Scissors} label="Servicio" value={service ? `${service.name} · ${formatPriceCents(service.price_cents)}` : "Por elegir"} />
                <SummaryRow icon={Calendar} label="Día" value={slot ? slot.starts_at.toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" }) : (step === "datetime" ? date.toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" }) : "Por elegir")} />
                <SummaryRow icon={Clock} label="Hora" value={slot ? formatTime(slot.starts_at, tz) : "Por elegir"} />
              </div>
              {/* Collapsed mobile summary */}
              {!summaryOpen && (
                <div className="lg:hidden grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-xl border border-border bg-background/50 px-3 py-2 truncate">
                    <span className="text-muted-foreground">Sucursal:</span>{" "}
                    <span className="font-medium">{location?.name ?? (hasLocations ? "Por elegir" : "—")}</span>
                  </div>
                  <div className="rounded-xl border border-border bg-background/50 px-3 py-2 truncate">
                    <span className="text-muted-foreground">Servicio:</span>{" "}
                    <span className="font-medium">{service ? service.name : "Por elegir"}</span>
                  </div>
                </div>
              )}
              <p className="text-xs text-muted-foreground flex items-center gap-1.5 pt-2">
                <Sparkles className="size-3.5" /> Confirmación por WhatsApp
              </p>
            </div>
          ) : null}
        </div>
      </aside>

      {/* Main: paso actual */}
      <main className={cn("max-w-2xl w-full mx-auto px-4 py-8 lg:px-12 lg:py-14 space-y-6", (step === "datetime" && slot) || (step === "client" && slot) ? "pb-24 lg:pb-8" : "pb-8")}>
        {step !== "done" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              {step !== "location" ? (
                <button onClick={goBack} className="text-sm text-muted-foreground flex items-center gap-1 hover:text-foreground transition-colors">
                  <ChevronLeft className="size-4" /> Atrás
                </button>
              ) : <span />}
              <span className="text-xs font-medium text-muted-foreground">Paso {stepIndex + 1} de {totalSteps}</span>
            </div>
            <div className="flex items-center gap-2">
              {stepLabels.map((label, i) => {
                const done = i < stepIndex;
                const active = i === stepIndex;
                return (
                  <div key={label} className="flex-1 flex flex-col gap-1.5 min-w-0">
                    <div className={cn(
                      "h-1.5 rounded-full transition-all duration-500",
                      done ? "bg-primary" : active ? "bg-primary/70" : "bg-muted"
                    )} />
                    <p className={cn(
                      "text-[10px] font-medium leading-tight truncate hidden sm:block",
                      done || active ? "text-foreground" : "text-muted-foreground"
                    )}>{label}</p>
                    {/* Mobile: only show current step text */}
                    {active && (
                      <p className="sm:hidden text-[10px] font-medium leading-tight truncate text-foreground">{label}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 1: Sucursal */}
        {step === "location" && (
          <>
            <div className="space-y-1">
              <h2 className="font-display text-2xl">Elige una sucursal</h2>
              <p className="text-sm text-muted-foreground">Selecciona el local donde quieres tu cita.</p>
            </div>
            {!locations?.length ? (
              <p className="text-muted-foreground">Este salón aún no tiene sucursales activas.</p>
            ) : (
              <div className="grid gap-3">
                {locations.map((l) => {
                  const selected = l.id === locationId;
                  return (
                    <button key={l.id} onClick={() => { setLocationId(l.id); setStep("mode"); }} className="text-left active:scale-[0.98] transition-transform group">
                      <Card className={cn("transition-all", selected ? "border-primary ring-2 ring-primary/20" : "hover:border-primary hover:shadow-md")}>
                        <CardContent className="pt-5 pb-5 flex items-center gap-4">
                          <div className="size-12 rounded-2xl bg-primary/10 grid place-items-center shrink-0">
                            <MapPin className="size-5 text-primary" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium">{l.name}</p>
                            {l.address && <p className="text-sm text-muted-foreground truncate">{l.address}</p>}
                          </div>
                          <ChevronRight className="size-5 text-muted-foreground/50 group-hover:text-primary transition-colors shrink-0" />
                        </CardContent>
                      </Card>
                    </button>
                  );
                })}
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
              <button onClick={() => { setMode("pro"); setStep("pickPro"); }} className="text-left active:scale-[0.98] transition-transform">
                <Card className="hover:border-primary transition-colors h-full">
                  <CardContent className="pt-6 pb-6 text-center space-y-2">
                    <User2 className="size-8 text-primary mx-auto" />
                    <p className="font-medium">Por profesional</p>
                    <p className="text-xs text-muted-foreground">Elige primero a la persona y luego el servicio.</p>
                  </CardContent>
                </Card>
              </button>
              <button onClick={() => { setMode("svc"); setStep("pickSvc"); }} className="text-left active:scale-[0.98] transition-transform">
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
            <div className="space-y-1">
              <h2 className="font-display text-2xl">Elige un profesional</h2>
              <p className="text-sm text-muted-foreground">{mode === "svc" && service ? `Disponibles para ${service.name}` : "Quien te atenderá"}</p>
            </div>
            {!locPros?.length && mode === "pro" && <p className="text-muted-foreground">No hay profesionales en esta sucursal.</p>}
            {mode === "svc" && !svcPros?.length && <p className="text-muted-foreground">Nadie ofrece este servicio en esta sucursal.</p>}
            <div className="grid gap-2 sm:grid-cols-2">
              {(mode === "pro" ? locPros : svcPros)?.map((p: any) => (
                <button key={p.id} onClick={() => {
                  setProfessionalId(p.id);
                  if (mode === "pro") setStep("pickSvc");
                  else setStep("datetime");
                }} className="text-left active:scale-[0.98] transition-transform group">
                  <Card className="hover:border-primary hover:shadow-md transition-all h-full">
                    <CardContent className="pt-4 pb-4 flex items-center gap-3">
                      {p.avatar_url ? (
                        <img
                          src={p.avatar_url}
                          alt={p.name}
                          width={48}
                          height={48}
                          loading="lazy"
                          decoding="async"
                          className="size-12 rounded-full object-cover border border-border shrink-0"
                        />
                      ) : (
                        <div className="size-12 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 grid place-items-center text-primary font-medium shrink-0">
                          {p.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{p.name}</p>
                        <p className="text-xs text-muted-foreground">Profesional</p>
                      </div>
                      <ChevronRight className="size-4 text-muted-foreground/50 group-hover:text-primary transition-colors shrink-0" />
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
            <div className="space-y-1">
              <h2 className="font-display text-2xl">Elige un servicio</h2>
              <p className="text-sm text-muted-foreground">{mode === "pro" && professional ? `Ofrecidos por ${professional.name}` : "Lo que necesitas hoy"}</p>
            </div>
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
                    }} className="text-left active:scale-[0.98] transition-transform group">
                      <Card className="hover:border-primary hover:shadow-md transition-all">
                        <CardContent className="pt-4 pb-4 flex items-start gap-4">
                          <div className="size-11 rounded-xl bg-primary/10 grid place-items-center shrink-0">
                            <Scissors className="size-5 text-primary" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium">{s.name}</p>
                            {s.description && <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5">{s.description}</p>}
                            <div className="flex items-center gap-2 mt-2">
                              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-full">
                                <Clock className="size-3" /> {s.duration_minutes} min
                              </span>
                            </div>
                          </div>
                          <p className="font-semibold text-primary text-lg shrink-0">{formatPriceCents(s.price_cents)}</p>
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
            <div className="space-y-1">
              <h2 className="font-display text-2xl">¿Cuándo te viene bien?</h2>
              <p className="text-sm text-muted-foreground">Elige día y hora disponible.</p>
            </div>
            <div>
              <Label className="mb-2 block text-xs uppercase tracking-wider text-muted-foreground">Día</Label>
              <div className="flex gap-2 overflow-x-auto pb-2 snap-x snap-mandatory scroll-smooth -mx-4 px-4">
                {next7.map((d) => {
                  const active = d.toDateString() === date.toDateString();
                  return (
                    <button key={d.toDateString()} onClick={() => { setDate(d); setSlot(null); }} className={cn("flex-shrink-0 px-3 py-2.5 rounded-2xl border text-center min-w-[4.75rem] snap-center active:scale-95 transition-all", active ? "border-primary bg-primary text-primary-foreground shadow-md" : "border-border hover:border-primary/50 bg-card")}>
                      <p className={cn("text-[10px] uppercase tracking-wider font-medium", active ? "text-primary-foreground/80" : "text-muted-foreground")}>{dateLabel(d)}</p>
                      <p className="font-semibold text-lg leading-tight">{d.getDate()}</p>
                      <p className={cn("text-[10px]", active ? "text-primary-foreground/80" : "text-muted-foreground")}>{d.toLocaleDateString("es-PE", { month: "short" })}</p>
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <Label className="mb-2 block text-xs uppercase tracking-wider text-muted-foreground">Hora disponible</Label>
              {!slots ? <p className="text-sm text-muted-foreground">Cargando…</p> : !slots.length ? (
                <div className="rounded-2xl border border-dashed border-border p-6 text-center space-y-1">
                  <Calendar className="size-6 text-muted-foreground/50 mx-auto" />
                  <p className="text-sm font-medium">Sin horarios este día</p>
                  <p className="text-xs text-muted-foreground">{slotsRes?.error ?? "Prueba otra fecha de la lista."}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {(() => {
                    const grouped = groupSlotsByPartOfDay(slots, tz);
                    const sections: { key: keyof typeof grouped; label: string; icon: any }[] = [
                      { key: "morning", label: "Mañana", icon: Sun },
                      { key: "afternoon", label: "Tarde", icon: Sunset },
                      { key: "evening", label: "Noche", icon: Moon },
                    ];
                    return sections.map(({ key, label, icon: Icon }) => {
                      const list = grouped[key];
                      if (!list.length) return null;
                      return (
                        <div key={key}>
                          <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
                            <Icon className="size-3.5" />
                            <span className="font-medium">{label}</span>
                            <span className="text-muted-foreground/60">· {list.length} horarios</span>
                          </div>
                          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                            {list.map((s) => {
                              const active = slot?.starts_at.toISOString() === s.starts_at.toISOString();
                              return (
                                <button
                                  key={s.starts_at.toISOString()}
                                  onClick={() => setSlot(s)}
                                  className={cn(
                                    "px-3 py-3 rounded-xl border text-sm transition-all min-h-[44px] active:scale-95",
                                    active
                                      ? "border-primary bg-primary text-primary-foreground font-semibold shadow-md"
                                      : "border-border hover:border-primary bg-card"
                                  )}
                                >
                                  {formatTime(s.starts_at, tz)}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              )}
            </div>
            {/* Mobile sticky CTA */}
            {slot && (
              <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur border-t border-border p-4 z-50">
                <div className="flex items-center justify-between mb-2 text-xs">
                  <span className="text-muted-foreground">Seleccionado</span>
                  <span className="font-medium">{formatTime(slot.starts_at, tz)}</span>
                </div>
                <Button className="w-full" size="lg" onClick={() => setStep("client")}>
                  Siguiente <ChevronRight className="size-4" />
                </Button>
              </div>
            )}
            {/* Desktop inline CTA */}
            {slot && (
              <Button className="hidden lg:flex w-full mt-4" size="lg" onClick={() => setStep("client")}>
                Siguiente <ChevronRight className="size-4" />
              </Button>
            )}
          </>
        )}

        {step === "client" && slot && service && (
          <>
            <div className="space-y-1">
              <h2 className="font-display text-2xl">Tus datos</h2>
              <p className="text-sm text-muted-foreground">Te enviaremos la confirmación por WhatsApp.</p>
            </div>
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="pt-4 pb-4 space-y-2">
                <div className="flex items-center gap-2 text-xs text-primary font-medium uppercase tracking-wider">
                  <Sparkles className="size-3.5" /> Resumen
                </div>
                <p className="font-semibold">{service.name}</p>
                <div className="space-y-1 text-sm text-muted-foreground">
                  <p className="flex items-center gap-2"><User2 className="size-3.5" /> {professional?.name}</p>
                  {location?.name && <p className="flex items-center gap-2"><MapPin className="size-3.5" /> {location.name}</p>}
                  <p className="flex items-center gap-2"><Calendar className="size-3.5" /> {slot.starts_at.toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" })}</p>
                  <p className="flex items-center gap-2"><Clock className="size-3.5" /> {formatTime(slot.starts_at, tz)} · {service.duration_minutes} min</p>
                </div>
                <p className="text-lg font-semibold text-primary pt-1">{formatPriceCents(service.price_cents)}</p>
              </CardContent>
            </Card>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5"><UserCircle2 className="size-3.5" /> Nombre completo</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Cómo te llamamos" />
                {name && name.trim().length < 2 && <p className="text-xs text-destructive">Escribe al menos 2 caracteres.</p>}
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5"><Phone className="size-3.5" /> WhatsApp</Label>
                <PhoneInput
                  countryCode={countryCode}
                  number={phone}
                  onCountryCodeChange={setCountryCode}
                  onNumberChange={setPhone}
                />
                <p className="text-xs text-muted-foreground">Usaremos este número solo para confirmar tu cita.</p>
              </div>
              <Turnstile key={captchaKey} onToken={setCaptchaToken} />
              {/* Desktop inline CTA */}
              <Button className="hidden lg:flex w-full" size="lg" onClick={() => book.mutate()} disabled={!name || name.trim().length < 2 || !phone || book.isPending || (captchaRequired && !captchaToken)}>
                <Check className="size-4" />
                {book.isPending ? "Reservando…" : "Confirmar reserva"}
              </Button>
            </div>
            {/* Mobile sticky CTA */}
            <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur border-t border-border p-4 z-50">
              <Button className="w-full" size="lg" onClick={() => book.mutate()} disabled={!name || name.trim().length < 2 || !phone || book.isPending || (captchaRequired && !captchaToken)}>
                <Check className="size-4" />
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