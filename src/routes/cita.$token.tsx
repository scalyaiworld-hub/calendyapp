import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarClock, MapPin, Scissors, User2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cancelBookingByToken, getBookingByToken } from "@/lib/api/manage-booking.functions";
import { formatTime } from "@/lib/format";

export const Route = createFileRoute("/cita/$token")({
  head: () => ({
    meta: [{ title: "Tu reserva — Calendya" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: ManageBookingPage,
});

const STATUS_TEXT: Record<string, string> = {
  pending: "Pendiente de confirmación",
  booked: "Confirmada",
  completed: "Completada",
  cancelled: "Cancelada",
  no_show: "No asististe",
};

function ManageBookingPage() {
  const { token } = Route.useParams();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["manage-booking", token],
    queryFn: () => getBookingByToken({ data: { token } }),
  });
  const cancel = useMutation({
    mutationFn: () => cancelBookingByToken({ data: { token } }),
    onSuccess: () => {
      toast.success("Tu reserva fue cancelada");
      qc.invalidateQueries({ queryKey: ["manage-booking", token] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading)
    return (
      <div className="min-h-screen grid place-items-center text-muted-foreground">Cargando…</div>
    );
  if (!q.data?.found) {
    return (
      <div className="min-h-screen grid place-items-center text-muted-foreground px-6 text-center">
        No encontramos esta reserva.
      </div>
    );
  }
  const b = q.data;
  const start = new Date(b.startsAt);

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="max-w-md mx-auto space-y-5">
        <div className="text-center space-y-1">
          <p className="text-sm text-muted-foreground">Tu reserva en</p>
          <h1 className="font-display text-2xl">{b.businessName}</h1>
          <p className="text-sm font-medium">{STATUS_TEXT[b.status] ?? b.status}</p>
        </div>

        <Card>
          <CardContent className="pt-6 space-y-3 text-sm">
            <p className="flex items-center gap-2">
              <Scissors className="size-4 text-primary" /> {b.serviceName} · {b.durationMinutes} min
            </p>
            <p className="flex items-center gap-2">
              <CalendarClock className="size-4 text-primary" />
              {start.toLocaleDateString("es-PE", {
                weekday: "long",
                day: "numeric",
                month: "long",
                timeZone: b.timezone,
              })}{" "}
              · {formatTime(start, b.timezone)}
            </p>
            {b.professionalName && (
              <p className="flex items-center gap-2">
                <User2 className="size-4 text-primary" /> {b.professionalName}
              </p>
            )}
            {b.locationName && (
              <p className="flex items-center gap-2">
                <MapPin className="size-4 text-primary" /> {b.locationName}
              </p>
            )}
            {b.status === "cancelled" && b.cancelledReason && (
              <p className="text-muted-foreground">Motivo: {b.cancelledReason}</p>
            )}
          </CardContent>
        </Card>

        {b.canCancel ? (
          <Button
            variant="destructive"
            className="w-full"
            disabled={cancel.isPending}
            onClick={() => {
              if (confirm("¿Cancelar esta reserva? Esta acción no se puede deshacer."))
                cancel.mutate();
            }}
          >
            {cancel.isPending ? "Cancelando…" : "Cancelar mi reserva"}
          </Button>
        ) : (
          (b.status === "pending" || b.status === "booked") && (
            <p className="text-xs text-muted-foreground text-center">
              Ya no se puede cancelar en línea (hasta {b.cancelMinHours} h antes de la cita).
              Contacta directamente al negocio.
            </p>
          )
        )}

        <p className="text-center">
          <a href={`/b/${b.businessSlug}`} className="text-sm underline text-muted-foreground">
            Reservar otra cita
          </a>
        </p>
      </div>
    </div>
  );
}
