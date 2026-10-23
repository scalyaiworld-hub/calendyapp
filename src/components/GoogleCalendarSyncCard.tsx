import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AlertTriangle, CalendarCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  disconnectGoogleCalendar,
  getGoogleCalendarStatus,
  listGoogleCalendars,
  setDefaultCalendar,
  setProfessionalCalendar,
  startGoogleCalendarConnect,
} from "@/lib/api/google-calendar.functions";

// Valor del selector por profesional que significa "sin calendario propio".
const USE_DEFAULT = "__default__";

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("es-PE", { dateStyle: "short", timeStyle: "short" }) : "—";

export function GoogleCalendarSyncCard({ businessId }: { businessId: string }) {
  const qc = useQueryClient();
  const statusKey = ["google-calendar", businessId];
  const status = useQuery({
    queryKey: statusKey,
    queryFn: () => getGoogleCalendarStatus({ data: { businessId } }),
    // Mientras haya cambios en cola (o se estén borrando eventos) se refresca solo.
    refetchInterval: (q) =>
      q.state.data?.connection?.status === "disconnecting" || (q.state.data?.pendingJobs ?? 0) > 0
        ? 5000
        : false,
  });
  const conn = status.data?.connection ?? null;
  const calendars = useQuery({
    queryKey: ["google-calendars", businessId],
    enabled: conn?.status === "active",
    retry: false,
    staleTime: 5 * 60_000,
    queryFn: () => listGoogleCalendars({ data: { businessId } }),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: statusKey });
  const onError = (e: Error) => {
    toast.error(e.message);
    refresh();
  };

  const connect = useMutation({
    mutationFn: () => startGoogleCalendarConnect({ data: { businessId } }),
    onSuccess: ({ url }) => {
      window.location.href = url;
    },
    onError,
  });
  const changeDefault = useMutation({
    mutationFn: (calendarId: string) => setDefaultCalendar({ data: { businessId, calendarId } }),
    onSuccess: () => {
      toast.success("Calendario actualizado; las próximas citas se moverán en unos minutos");
      refresh();
    },
    onError,
  });
  const changePro = useMutation({
    mutationFn: (v: { professionalId: string; calendarId: string | null }) =>
      setProfessionalCalendar({ data: { businessId, ...v } }),
    onSuccess: () => {
      toast.success("Calendario del profesional actualizado");
      refresh();
    },
    onError,
  });
  const [deleteEvents, setDeleteEvents] = useState(false);
  const disconnect = useMutation({
    mutationFn: () => disconnectGoogleCalendar({ data: { businessId, deleteEvents } }),
    onSuccess: () => {
      toast.success(
        deleteEvents ? "Borrando los eventos de Google…" : "Google Calendar desconectado",
      );
      setDeleteEvents(false);
      refresh();
    },
    onError,
  });

  // El calendario principal se guarda con el alias "primary" para no mover eventos sin motivo.
  const options = (calendars.data ?? []).map((c) => ({
    value: c.primary ? "primary" : c.id,
    label: c.primary ? `${c.summary} (principal)` : c.summary,
  }));
  const optionsWith = (value: string | null) =>
    value && !options.some((o) => o.value === value)
      ? [...options, { value, label: value === "primary" ? "Calendario principal" : value }]
      : options;

  const d = status.data;
  const disconnectButton = (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" disabled={disconnect.isPending}>
          Desconectar
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Desconectar Google Calendar?</AlertDialogTitle>
          <AlertDialogDescription>
            Las citas nuevas dejarán de aparecer en Google. Los eventos ya creados se quedan en tu
            calendario, salvo que marques la casilla.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {conn?.status !== "revoked" && (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={deleteEvents} onCheckedChange={(v) => setDeleteEvents(v === true)} />
            Borrar también los eventos creados en Google
          </label>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={() => disconnect.mutate()}>Desconectar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarCheck className="size-4" /> Sincronización con Google Calendar
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {status.isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
        {status.error && (
          <p className="text-sm text-destructive">{(status.error as Error).message}</p>
        )}

        {d && !conn && (
          <>
            <p className="text-sm text-muted-foreground">
              Cada cita que se crea, cambia o cancela en Calendya aparece en tu Google Calendar en
              menos de un minuto. Los clientes no reciben invitaciones de Google.
            </p>
            {d.configured ? (
              <Button onClick={() => connect.mutate()} disabled={connect.isPending}>
                {connect.isPending && <Loader2 className="size-4 mr-2 animate-spin" />}
                Conectar Google Calendar
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                La conexión con Google aún no está configurada en este servidor.
              </p>
            )}
          </>
        )}

        {conn?.status === "disconnecting" && (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" /> Borrando los eventos de Google
            {d && d.pendingJobs > 0 ? ` (quedan ${d.pendingJobs})` : ""}…
          </p>
        )}

        {(conn?.status === "revoked" || conn?.status === "error") && (
          <div className="rounded-md border border-destructive/40 p-3 space-y-3">
            <p className="text-sm flex items-start gap-2">
              <AlertTriangle className="size-4 text-destructive shrink-0 mt-0.5" />
              <span>
                Se perdió el acceso a la cuenta <strong>{conn.email}</strong>.{" "}
                {conn.lastError ?? "Vuelve a conectarla para seguir sincronizando."}
              </span>
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => connect.mutate()}
                disabled={connect.isPending || !d?.configured}
              >
                Reconectar
              </Button>
              {disconnectButton}
            </div>
          </div>
        )}

        {conn?.status === "active" && d && (
          <>
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">Conectado como {conn.email}</p>
                <p className="text-xs text-muted-foreground">
                  Última sincronización {fmt(conn.lastSyncedAt)}
                  {d.pendingJobs > 0 && ` · ${d.pendingJobs} cambios en cola`}
                </p>
              </div>
              {disconnectButton}
            </div>

            {calendars.error && (
              <p className="text-sm text-destructive">{(calendars.error as Error).message}</p>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="gcal-default">Calendario de destino</Label>
              <Select
                value={conn.defaultCalendarId}
                onValueChange={(v) => changeDefault.mutate(v)}
                disabled={!calendars.data || changeDefault.isPending}
              >
                <SelectTrigger id="gcal-default">
                  <SelectValue placeholder="Elige un calendario" />
                </SelectTrigger>
                <SelectContent>
                  {optionsWith(conn.defaultCalendarId).map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {d.professionals.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Calendario por profesional (opcional)</p>
                <ul className="divide-y divide-border">
                  {d.professionals.map((p) => (
                    <li key={p.id} className="py-2 flex items-center gap-3">
                      <span className="text-sm flex-1 truncate">{p.name}</span>
                      <Select
                        value={p.calendarId ?? USE_DEFAULT}
                        onValueChange={(v) =>
                          changePro.mutate({
                            professionalId: p.id,
                            calendarId: v === USE_DEFAULT ? null : v,
                          })
                        }
                        disabled={!calendars.data || changePro.isPending}
                      >
                        <SelectTrigger className="w-56" aria-label={`Calendario de ${p.name}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={USE_DEFAULT}>Usar el de destino</SelectItem>
                          {optionsWith(p.calendarId).map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {(d.failedJobs > 0 || conn.lastError) && (
              <p className="text-xs text-destructive">
                {d.failedJobs > 0 &&
                  `${d.failedJobs} ${d.failedJobs === 1 ? "cita no se pudo" : "citas no se pudieron"} sincronizar en los últimos 7 días. `}
                {conn.lastError && `Último error: ${conn.lastError}`}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
