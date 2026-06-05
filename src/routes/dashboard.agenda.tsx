import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMyBusiness } from "@/lib/business";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { ChevronLeft, ChevronRight, Plus, CalendarIcon, Link2, Building2 } from "lucide-react";
import { DAY_NAMES_SHORT, formatTime } from "@/lib/format";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PhoneInput } from "@/components/PhoneInput";
import { DEFAULT_COUNTRY_CODE } from "@/lib/countries";

export const Route = createFileRoute("/dashboard/agenda")({
  component: AgendaPage,
});

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate()+n); return x; }
function toLocalDateInput(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function fromLocalDateInput(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function AgendaPage() {
  const { data: business } = useMyBusiness();
  const businessId = business?.id;
  const qc = useQueryClient();
  const [date, setDate] = useState(startOfDay(new Date()));
  const [pickerOpen, setPickerOpen] = useState(false);

  const { data: appts, error: apptsError } = useQuery({
    queryKey: ["appts", businessId, date.toDateString()],
    enabled: !!businessId,
    queryFn: async () => {
      const end = addDays(date, 1);
      const { data, error } = await supabase
        .from("appointments")
        .select("*, clients(name, phone), services(name, duration_minutes, price_cents)")
        .eq("business_id", businessId!)
        .gte("starts_at", date.toISOString())
        .lt("starts_at", end.toISOString())
        .order("starts_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: any }) => {
      const patch: any = { status };
      if (status === "cancelled") patch.cancelled_at = new Date().toISOString();
      const { error } = await supabase.from("appointments").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["appts"] }); toast.success("Actualizado"); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!business) return <p className="text-muted-foreground">Primero crea tu salón.</p>;

  const isToday = date.toDateString() === new Date().toDateString();
  const bookingUrl = typeof window !== "undefined" ? `${window.location.origin}/b/${business.slug}` : `/b/${business.slug}`;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-2 flex-wrap">
        <div>
          <h1 className="font-display text-3xl mb-1">Agenda</h1>
          <p className="text-muted-foreground">Citas del día.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={() => {
              navigator.clipboard.writeText(bookingUrl);
              toast.success("Link copiado", { description: bookingUrl });
            }}
          >
            <Link2 className="size-4" /> Copiar link de reservas
          </Button>
          <NewApptDialog businessId={businessId!} initialDate={date} trigger={<Button><Plus className="size-4" /> Nueva cita</Button>} />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <Button variant="outline" size="sm" onClick={() => setDate(addDays(date, -1))}><ChevronLeft className="size-4" /></Button>
        <div className="flex items-center gap-2 flex-wrap justify-center">
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <Button variant="ghost" className="font-display text-lg sm:text-xl gap-2">
                <CalendarIcon className="size-4" />
                {DAY_NAMES_SHORT[date.getDay()]} {date.toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="center">
              <Calendar
                mode="single"
                selected={date}
                onSelect={(d) => { if (d) { setDate(startOfDay(d)); setPickerOpen(false); } }}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
          {!isToday && <Button variant="ghost" size="sm" onClick={() => setDate(startOfDay(new Date()))}>Hoy</Button>}
        </div>
        <Button variant="outline" size="sm" onClick={() => setDate(addDays(date, 1))}><ChevronRight className="size-4" /></Button>
      </div>

      {apptsError ? (
        <Card><CardContent className="pt-6 text-center text-destructive text-sm">Error al cargar las citas: {(apptsError as Error).message}</CardContent></Card>
      ) : !appts?.length ? (
        <Card><CardContent className="pt-6 text-center text-muted-foreground">No hay citas este día.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {appts.map((a: any) => (
            <Card key={a.id} className={cn(a.status === "cancelled" && "opacity-50", a.status === "no_show" && "border-destructive/40")}>
              <CardContent className="pt-4 pb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-4">
                  <div className="text-center">
                    <p className="font-display text-xl">{formatTime(a.starts_at)}</p>
                    <p className="text-xs text-muted-foreground">{a.services?.duration_minutes}m</p>
                  </div>
                  <div>
                    <p className="font-medium">{a.clients?.name}</p>
                    <p className="text-sm text-muted-foreground">{a.services?.name} · {a.clients?.phone}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={a.status} />
                  <Select value={a.status} onValueChange={(v) => updateStatus.mutate({ id: a.id, status: v })}>
                    <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pendiente</SelectItem>
                      <SelectItem value="booked">Confirmada</SelectItem>
                      <SelectItem value="completed">Completada</SelectItem>
                      <SelectItem value="cancelled">Cancelada</SelectItem>
                      <SelectItem value="no_show">No-show</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    booked: "bg-primary/15 text-primary",
    completed: "bg-green-100 text-green-800",
    cancelled: "bg-muted text-muted-foreground",
    no_show: "bg-destructive/15 text-destructive",
  };
  return <span className={cn("text-xs px-2 py-0.5 rounded-full hidden sm:inline-block", map[status])}>{status}</span>;
}

function NewApptDialog({ businessId, initialDate, trigger }: { businessId: string; initialDate: Date; trigger: React.ReactNode }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [serviceId, setServiceId] = useState("");
  const [clientId, setClientId] = useState("");
  const [newClientName, setNewClientName] = useState("");
  const [newClientCountry, setNewClientCountry] = useState(DEFAULT_COUNTRY_CODE);
  const [newClientPhone, setNewClientPhone] = useState("");
  const [creatingClient, setCreatingClient] = useState(false);
  const [dateStr, setDateStr] = useState(toLocalDateInput(initialDate));
  const [time, setTime] = useState("10:00");

  useEffect(() => { if (open) setDateStr(toLocalDateInput(initialDate)); }, [open, initialDate]);

  const { data: services } = useQuery({
    queryKey: ["services-active", businessId],
    enabled: open,
    queryFn: async () => (await supabase.from("services").select("*").eq("business_id", businessId).is("deleted_at", null).eq("is_active", true).order("name")).data ?? [],
  });
  const { data: clients } = useQuery({
    queryKey: ["clients-min", businessId],
    enabled: open,
    queryFn: async () => (await supabase.from("clients").select("id,name,phone").eq("business_id", businessId).is("deleted_at", null).order("name")).data ?? [],
  });

  const create = useMutation({
    mutationFn: async () => {
      let cid = clientId;
      if (creatingClient) {
        if (!newClientName || !newClientPhone) throw new Error("Faltan datos del cliente");
        const { data, error } = await supabase
          .from("clients")
          .insert({
            business_id: businessId,
            name: newClientName,
            phone: newClientPhone,
            phone_country_code: newClientCountry,
          })
          .select()
          .single();
        if (error) throw error;
        cid = data.id;
      }
      const svc = services?.find((s) => s.id === serviceId);
      if (!svc || !cid) throw new Error("Falta servicio o cliente");
      const [h, m] = time.split(":").map(Number);
      const starts = fromLocalDateInput(dateStr);
      starts.setHours(h, m, 0, 0);
      const ends = new Date(starts.getTime() + svc.duration_minutes * 60000);
      const { error } = await supabase.from("appointments").insert({
        business_id: businessId, client_id: cid, service_id: serviceId,
        starts_at: starts.toISOString(), ends_at: ends.toISOString(),
        source: "manual", status: "booked",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cita creada");
      qc.invalidateQueries({ queryKey: ["appts"] });
      qc.invalidateQueries({ queryKey: ["today-appts"] });
      setOpen(false);
      setServiceId(""); setClientId(""); setNewClientName(""); setNewClientPhone(""); setNewClientCountry(DEFAULT_COUNTRY_CODE); setCreatingClient(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Nueva cita</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Servicio</Label>
            <Select value={serviceId} onValueChange={setServiceId}>
              <SelectTrigger><SelectValue placeholder="Elegir servicio" /></SelectTrigger>
              <SelectContent>
                {services?.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} · {s.duration_minutes}m</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <Label>Cliente</Label>
              <button type="button" className="text-xs text-primary underline" onClick={() => setCreatingClient(!creatingClient)}>
                {creatingClient ? "Elegir existente" : "+ Nuevo cliente"}
              </button>
            </div>
            {creatingClient ? (
              <div className="space-y-2">
                <Input placeholder="Nombre" value={newClientName} onChange={(e) => setNewClientName(e.target.value)} />
                <PhoneInput
                  countryCode={newClientCountry}
                  number={newClientPhone}
                  onCountryCodeChange={setNewClientCountry}
                  onNumberChange={setNewClientPhone}
                />
              </div>
            ) : (
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger><SelectValue placeholder="Elegir cliente" /></SelectTrigger>
                <SelectContent>
                  {clients?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} · {c.phone}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Fecha</Label><Input type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} /></div>
            <div><Label>Hora</Label><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => create.mutate()} disabled={create.isPending}>Crear cita</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}