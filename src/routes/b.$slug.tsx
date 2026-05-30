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
import { Check, ChevronLeft } from "lucide-react";

export const Route = createFileRoute("/b/$slug")({
  head: ({ params }) => ({ meta: [{ title: `Reservar — ${params.slug}` }] }),
  component: BookingPage,
});

type Step = "service" | "datetime" | "client" | "done";

function BookingPage() {
  const { slug } = Route.useParams();
  const [step, setStep] = useState<Step>("service");
  const [serviceId, setServiceId] = useState<string>("");
  const [date, setDate] = useState<Date>(() => { const d = new Date(); d.setHours(0,0,0,0); return d; });
  const [slot, setSlot] = useState<{ starts_at: Date; ends_at: Date } | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  const { data: business, isLoading } = useQuery({
    queryKey: ["public-biz", slug],
    queryFn: async () => {
      const { data, error } = await supabase.from("businesses").select("*").eq("slug", slug).is("deleted_at", null).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: services } = useQuery({
    queryKey: ["public-services", business?.id],
    enabled: !!business?.id,
    queryFn: async () => (await supabase.from("services").select("*").eq("business_id", business!.id).is("deleted_at", null).eq("is_active", true).order("display_order")).data ?? [],
  });

  const service = services?.find((s) => s.id === serviceId);

  const { data: slots } = useQuery({
    queryKey: ["slots", business?.id, serviceId, date.toDateString()],
    enabled: !!business?.id && !!serviceId,
    queryFn: () => getAvailableSlots({ businessId: business!.id, serviceId, date }),
  });

  const book = useMutation({
    mutationFn: async () => {
      if (!business || !service || !slot) throw new Error("Faltan datos");
      // Upsert client by phone
      const { data: existing } = await supabase.from("clients").select("id").eq("business_id", business.id).eq("phone", phone).is("deleted_at", null).maybeSingle();
      let clientId = existing?.id;
      if (!clientId) {
        const { data, error } = await supabase.from("clients").insert({ business_id: business.id, name, phone }).select().single();
        if (error) throw error;
        clientId = data.id;
      }
      const { error } = await supabase.from("appointments").insert({
        business_id: business.id, client_id: clientId, service_id: service.id,
        starts_at: slot.starts_at.toISOString(), ends_at: slot.ends_at.toISOString(),
        source: "booking_page", status: "booked",
      });
      if (error) throw error;
    },
    onSuccess: () => setStep("done"),
    onError: (e: Error) => toast.error("No se pudo reservar: " + e.message),
  });

  if (isLoading) return <div className="min-h-screen grid place-items-center text-muted-foreground">Cargando…</div>;
  if (!business) return <div className="min-h-screen grid place-items-center text-muted-foreground">Salón no encontrado</div>;

  const next7 = Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()+i); return d; });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="max-w-2xl mx-auto px-4 py-6 text-center">
          <h1 className="font-display text-3xl gradient-rose-text">{business.name}</h1>
          {business.phone && <p className="text-sm text-muted-foreground mt-1">{business.phone}</p>}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {step !== "done" && step !== "service" && (
          <button onClick={() => setStep(step === "client" ? "datetime" : "service")} className="text-sm text-muted-foreground flex items-center gap-1">
            <ChevronLeft className="size-4" /> Atrás
          </button>
        )}

        {step === "service" && (
          <>
            <h2 className="font-display text-2xl">Elige un servicio</h2>
            {!services?.length ? (
              <p className="text-muted-foreground">Este salón aún no tiene servicios disponibles.</p>
            ) : (
              <div className="grid gap-3">
                {services.map((s) => (
                  <button key={s.id} onClick={() => { setServiceId(s.id); setStep("datetime"); }} className="text-left">
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
            )}
          </>
        )}

        {step === "datetime" && service && (
          <>
            <div>
              <p className="text-sm text-muted-foreground">Servicio elegido</p>
              <p className="font-medium">{service.name} · {service.duration_minutes} min · {formatPriceCents(service.price_cents)}</p>
            </div>
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
              <p className="text-muted-foreground">{slot.starts_at.toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" })} · {formatTime(slot.starts_at)}</p>
            </CardContent></Card>
            <div className="space-y-3">
              <div><Label>Nombre</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div><Label>Teléfono</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+51 999 999 999" /></div>
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
            <h2 className="font-display text-2xl">¡Reserva confirmada!</h2>
            <p className="text-muted-foreground">Te esperamos. Si necesitas cambiar tu cita, llama al salón.</p>
            <Button variant="outline" onClick={() => { setStep("service"); setServiceId(""); setSlot(null); setName(""); setPhone(""); }}>Reservar otra cita</Button>
          </div>
        )}
      </main>
    </div>
  );
}