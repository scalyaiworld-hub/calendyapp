import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMyBusiness } from "@/lib/business";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Search, Filter, CalendarDays, User, Scissors, Clock, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { formatTime, formatCurrency, DAY_NAMES_SHORT } from "@/lib/format";

export const Route = createFileRoute("/dashboard/citas")({
  component: CitasPage,
});

type ApptStatus = "pending" | "booked" | "completed" | "cancelled" | "no_show";

const STATUS_LABEL: Record<ApptStatus, string> = {
  pending: "Pendiente",
  booked: "Confirmada",
  completed: "Completada",
  cancelled: "Cancelada",
  no_show: "No-show",
};

const STATUS_STYLES: Record<ApptStatus, string> = {
  pending: "bg-yellow-50 text-yellow-700 border-yellow-200",
  booked: "bg-primary/10 text-primary border-primary/20",
  completed: "bg-green-50 text-green-700 border-green-200",
  cancelled: "bg-muted/50 text-muted-foreground border-border",
  no_show: "bg-destructive/10 text-destructive border-destructive/20",
};

function CitasPage() {
  const { data: business } = useMyBusiness();
  const businessId = business?.id;
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ApptStatus | "all">("all");
  const [page, setPage] = useState(0);
  const [selectedAppt, setSelectedAppt] = useState<any>(null);
  const pageSize = 20;

  const { data: appointments, isLoading } = useQuery({
    queryKey: ["citas", businessId, statusFilter, search.trim(), page],
    enabled: !!businessId,
    queryFn: async () => {
      let q = supabase
        .from("appointments")
        .select("*, clients(name, phone), services(name, duration_minutes, price_cents), locations(name)", { count: "exact" })
        .eq("business_id", businessId!)
        .order("starts_at", { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (statusFilter !== "all") {
        q = q.eq("status", statusFilter);
      }

      const { data, error, count } = await q;
      if (error) throw error;
      return { items: data ?? [], count: count ?? 0 };
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ApptStatus }) => {
      const patch: any = { status };
      if (status === "cancelled") patch.cancelled_at = new Date().toISOString();
      const { error } = await supabase.from("appointments").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["citas"] });
      qc.invalidateQueries({ queryKey: ["appts"] });
      toast.success("Estado actualizado");
      setSelectedAppt(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filteredItems = search.trim()
    ? (appointments?.items ?? []).filter((a: any) =>
        a.clients?.name?.toLowerCase().includes(search.toLowerCase()) ||
        a.services?.name?.toLowerCase().includes(search.toLowerCase()) ||
        a.clients?.phone?.includes(search)
      )
    : (appointments?.items ?? []);

  const totalPages = Math.ceil((appointments?.count ?? 0) / pageSize);

  function formatDateLabel(iso: string) {
    const d = new Date(iso);
    return `${DAY_NAMES_SHORT[d.getDay()]} ${d.toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" })}`;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl mb-1">Citas</h1>
        <p className="text-muted-foreground">Historial y gestión de todas las citas.</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por cliente, servicio o teléfono..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="size-4 text-muted-foreground" />
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as ApptStatus | "all"); setPage(0); }}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Filtrar estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              <SelectItem value="pending">Pendiente</SelectItem>
              <SelectItem value="booked">Confirmada</SelectItem>
              <SelectItem value="completed">Completada</SelectItem>
              <SelectItem value="cancelled">Cancelada</SelectItem>
              <SelectItem value="no_show">No-show</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}><CardContent className="py-5"><div className="h-5 bg-muted rounded w-3/4 animate-pulse" /></CardContent></Card>
          ))}
        </div>
      ) : !filteredItems.length ? (
        <Card>
          <CardContent className="pt-8 pb-8 text-center text-muted-foreground">
            <CalendarDays className="size-8 mx-auto mb-2 opacity-40" />
            <p>No se encontraron citas.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredItems.map((a: any) => (
            <Card key={a.id} className="hover:shadow-soft transition-shadow cursor-pointer" onClick={() => setSelectedAppt(a)}>
              <CardContent className="py-4 px-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-4">
                    <div className="text-center min-w-[64px]">
                      <p className="font-display text-xl leading-none">{formatTime(a.starts_at)}</p>
                      <p className="text-xs text-muted-foreground mt-1">{formatDateLabel(a.starts_at)}</p>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <User className="size-3.5 text-muted-foreground" />
                        <p className="font-medium">{a.clients?.name}</p>
                        <span className="text-xs text-muted-foreground">{a.clients?.phone}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Scissors className="size-3.5 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">{a.services?.name}</p>
                        <span className="text-xs text-muted-foreground">· {a.services?.duration_minutes}m</span>
                      </div>
                      {a.locations?.name && (
                        <p className="text-xs text-muted-foreground">{a.locations?.name}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 self-start sm:self-center">
                    <span className={cn("text-xs px-2.5 py-1 rounded-full border font-medium", STATUS_STYLES[a.status as ApptStatus])}>
                      {STATUS_LABEL[a.status as ApptStatus]}
                    </span>
                    <p className="text-sm font-medium text-right hidden sm:block">{formatCurrency((a.services?.price_cents ?? 0) / 100)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-muted-foreground">
            Mostrando {page * pageSize + 1}-{Math.min((page + 1) * pageSize, appointments?.count ?? 0)} de {appointments?.count}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
              <ChevronLeft className="size-4" />
            </Button>
            <span className="text-sm text-muted-foreground min-w-[3ch] text-center">{page + 1}</span>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      <Dialog open={!!selectedAppt} onOpenChange={(v) => !v && setSelectedAppt(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Detalle de cita</DialogTitle>
          </DialogHeader>
          {selectedAppt && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span className={cn("text-xs px-2.5 py-1 rounded-full border font-medium", STATUS_STYLES[selectedAppt.status as ApptStatus])}>
                  {STATUS_LABEL[selectedAppt.status as ApptStatus]}
                </span>
              </div>
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-2">
                  <CalendarDays className="size-4 text-muted-foreground" />
                  <span>{formatDateLabel(selectedAppt.starts_at)} · {formatTime(selectedAppt.starts_at)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="size-4 text-muted-foreground" />
                  <span>{selectedAppt.services?.duration_minutes} minutos</span>
                </div>
                <div className="flex items-center gap-2">
                  <User className="size-4 text-muted-foreground" />
                  <span>{selectedAppt.clients?.name} · {selectedAppt.clients?.phone}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Scissors className="size-4 text-muted-foreground" />
                  <span>{selectedAppt.services?.name} · {formatCurrency((selectedAppt.services?.price_cents ?? 0) / 100)}</span>
                </div>
                {selectedAppt.locations?.name && (
                  <p className="text-muted-foreground">{selectedAppt.locations?.name}</p>
                )}
                {selectedAppt.notes && (
                  <div className="bg-muted/40 rounded-md p-3 text-sm">
                    <p className="text-muted-foreground text-xs mb-1">Notas</p>
                    <p>{selectedAppt.notes}</p>
                  </div>
                )}
              </div>
              <DialogFooter className="flex-col sm:flex-row gap-2">
                <Select
                  value={selectedAppt.status}
                  onValueChange={(v) => updateStatus.mutate({ id: selectedAppt.id, status: v as ApptStatus })}
                >
                  <SelectTrigger className="w-full sm:w-44">
                    <SelectValue placeholder="Cambiar estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pendiente</SelectItem>
                    <SelectItem value="booked">Confirmada</SelectItem>
                    <SelectItem value="completed">Completada</SelectItem>
                    <SelectItem value="cancelled">Cancelada</SelectItem>
                    <SelectItem value="no_show">No-show</SelectItem>
                  </SelectContent>
                </Select>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
