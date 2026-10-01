import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CalendarSync, Copy, KeyRound, RefreshCw, Send, Trash2, Webhook } from "lucide-react";
import { toast } from "sonner";
import { useMyBusiness } from "@/lib/business";
import { PlanGate } from "@/components/PlanGate";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BlockSkeleton } from "@/components/Skeletons";
import { WEBHOOK_EVENTS } from "@/lib/integrations";
import {
  createApiKey,
  createWebhook,
  deleteWebhook,
  disableCalendarFeed,
  getIntegrations,
  revokeApiKey,
  rotateCalendarFeed,
  sendTestWebhook,
  setWebhookActive,
} from "@/lib/api/integrations.functions";

export const Route = createFileRoute("/dashboard/integraciones")({
  head: () => ({ meta: [{ title: "Integraciones — Calendya" }] }),
  component: IntegrationsPage,
});

const EVENT_LABEL: Record<string, string> = {
  "appointment.created": "Cita creada",
  "appointment.updated": "Cita modificada",
  "appointment.cancelled": "Cita cancelada",
};

const copy = (text: string, what: string) => {
  navigator.clipboard.writeText(text).then(
    () => toast.success(`${what} copiado`),
    () => toast.error("No se pudo copiar; selecciónalo y cópialo a mano."),
  );
};

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("es-PE", { dateStyle: "short", timeStyle: "short" }) : "—";

function IntegrationsPage() {
  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader
        title="Integraciones"
        description="Conecta tu agenda con Google Calendar, Zapier y tus propias herramientas."
      />
      <PlanGate module="integrations">
        <IntegrationsBody />
      </PlanGate>
    </div>
  );
}

function IntegrationsBody() {
  const { data: business } = useMyBusiness();
  const qc = useQueryClient();
  const businessId = business?.id;
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const overview = useQuery({
    queryKey: ["integrations", businessId],
    enabled: !!businessId,
    queryFn: () => getIntegrations({ data: { businessId: businessId! } }),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["integrations", businessId] });
  const onError = (e: Error) => toast.error(e.message);

  // Secretos que solo se muestran una vez (clave de API y secreto de firma).
  const [revealed, setRevealed] = useState<{ kind: "key" | "secret"; value: string } | null>(null);

  const feedUrl = overview.data?.feedToken
    ? `${origin}/api/public/calendar/${overview.data.feedToken}.ics`
    : null;
  const rotateFeed = useMutation({
    mutationFn: () => rotateCalendarFeed({ data: { businessId: businessId! } }),
    onSuccess: () => {
      toast.success("Enlace de calendario generado");
      refresh();
    },
    onError,
  });
  const offFeed = useMutation({
    mutationFn: () => disableCalendarFeed({ data: { businessId: businessId! } }),
    onSuccess: () => {
      toast.success("Enlace de calendario desactivado");
      refresh();
    },
    onError,
  });

  const [keyName, setKeyName] = useState("");
  const newKey = useMutation({
    mutationFn: () => createApiKey({ data: { businessId: businessId!, name: keyName } }),
    onSuccess: ({ key }) => {
      setRevealed({ kind: "key", value: key });
      setKeyName("");
      refresh();
    },
    onError,
  });
  const revokeKey = useMutation({
    mutationFn: (id: string) => revokeApiKey({ data: { businessId: businessId!, id } }),
    onSuccess: () => {
      toast.success("Clave revocada");
      refresh();
    },
    onError,
  });

  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>([...WEBHOOK_EVENTS]);
  const newHook = useMutation({
    mutationFn: () =>
      createWebhook({
        data: { businessId: businessId!, url, events: events as (typeof WEBHOOK_EVENTS)[number][] },
      }),
    onSuccess: ({ secret }) => {
      setRevealed({ kind: "secret", value: secret });
      setUrl("");
      refresh();
    },
    onError,
  });
  const toggleHook = useMutation({
    mutationFn: (v: { id: string; isActive: boolean }) =>
      setWebhookActive({ data: { businessId: businessId!, ...v } }),
    onSuccess: refresh,
    onError,
  });
  const removeHook = useMutation({
    mutationFn: (id: string) => deleteWebhook({ data: { businessId: businessId!, id } }),
    onSuccess: () => {
      toast.success("Webhook eliminado");
      refresh();
    },
    onError,
  });
  const testHook = useMutation({
    mutationFn: (id: string) => sendTestWebhook({ data: { businessId: businessId!, id } }),
    onSuccess: (r) =>
      r.ok
        ? toast.success(`El destino respondió ${r.status}`)
        : toast.error(`Falló la prueba: ${r.error ?? "sin detalle"}`),
    onError,
  });

  const d = overview.data;
  const curl = `curl -H "Authorization: Bearer TU_CLAVE" \\\n  "${origin}/api/public/v1/appointments?from=2026-10-01T00:00:00Z&limit=50"`;

  return (
    <div className="space-y-6">
      {overview.isLoading && <BlockSkeleton className="h-40 w-full" />}
      {overview.error && (
        <p className="text-sm text-destructive">{(overview.error as Error).message}</p>
      )}

      {revealed && (
        <Card className="border-primary/40">
          <CardContent className="pt-5 space-y-3">
            <p className="text-sm font-medium">
              {revealed.kind === "key" ? "Tu nueva clave de API" : "Secreto de firma del webhook"} —
              cópiala ahora: no volverá a mostrarse.
            </p>
            <div className="flex gap-2">
              <Input
                readOnly
                value={revealed.value}
                onFocus={(e) => e.currentTarget.select()}
                className="font-mono text-xs"
              />
              <Button
                variant="outline"
                onClick={() => copy(revealed.value, revealed.kind === "key" ? "Clave" : "Secreto")}
              >
                <Copy className="size-4" />
              </Button>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setRevealed(null)}>
              Ya la guardé
            </Button>
          </CardContent>
        </Card>
      )}

      {d && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <CalendarSync className="size-4" /> Google Calendar y otros calendarios
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Suscribe tu agenda como calendario de solo lectura. En Google Calendar:{" "}
                <em>Otros calendarios → Desde URL</em>. Se actualiza solo (Google puede tardar
                varias horas).
              </p>
              {feedUrl ? (
                <>
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      value={feedUrl}
                      onFocus={(e) => e.currentTarget.select()}
                      className="font-mono text-xs"
                    />
                    <Button variant="outline" onClick={() => copy(feedUrl, "Enlace")}>
                      <Copy className="size-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Quien tenga este enlace puede ver tus citas (con nombre y teléfono del cliente).
                    No lo compartas.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={rotateFeed.isPending}
                      onClick={() => {
                        if (
                          window.confirm(
                            "El enlace actual dejará de funcionar y tendrás que volver a suscribirte. ¿Continuar?",
                          )
                        )
                          rotateFeed.mutate();
                      }}
                    >
                      <RefreshCw className="size-4 mr-2" /> Regenerar enlace
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={offFeed.isPending}
                      onClick={() => offFeed.mutate()}
                    >
                      Desactivar
                    </Button>
                  </div>
                </>
              ) : (
                <Button onClick={() => rotateFeed.mutate()} disabled={rotateFeed.isPending}>
                  Generar enlace de calendario
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <KeyRound className="size-4" /> Claves de API
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                API de solo lectura: <code>/api/public/v1/appointments</code>, <code>/clients</code>{" "}
                y <code>/services</code>. Úsala desde Zapier, Make o tus propios scripts.
              </p>
              <pre className="rounded-md bg-muted p-3 text-xs overflow-x-auto whitespace-pre-wrap break-all">
                {curl}
              </pre>
              <div className="flex gap-2">
                <Input
                  aria-label="Nombre de la clave"
                  placeholder="Nombre (p. ej. Zapier)"
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  maxLength={60}
                />
                <Button
                  onClick={() => newKey.mutate()}
                  disabled={!keyName.trim() || newKey.isPending}
                >
                  Crear clave
                </Button>
              </div>
              {d.apiKeys.length > 0 && (
                <ul className="divide-y divide-border">
                  {d.apiKeys.map((k) => (
                    <li key={k.id} className="py-3 flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{k.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">
                          {k.prefix}… · creada {fmt(k.createdAt)} · último uso {fmt(k.lastUsedAt)}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={revokeKey.isPending}
                        onClick={() => {
                          if (
                            window.confirm(
                              `¿Revocar la clave "${k.name}"? Lo que la use dejará de funcionar.`,
                            )
                          )
                            revokeKey.mutate(k.id);
                        }}
                      >
                        Revocar
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Webhook className="size-4" /> Webhooks
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Te avisamos con un POST a tu URL cuando cambia una cita. El aviso solo trae
                identificadores; consulta la API para ver el detalle. Cada envío va firmado (
                <code>X-Calendya-Signature</code> = HMAC-SHA256 de <code>timestamp.cuerpo</code> con
                tu secreto) y se reintenta si falla.
              </p>
              <div className="space-y-3">
                <div>
                  <Label htmlFor="hook-url">URL de destino (https)</Label>
                  <Input
                    id="hook-url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://hooks.zapier.com/hooks/catch/…"
                    className="mt-1.5"
                  />
                </div>
                <fieldset className="flex flex-wrap gap-4">
                  <legend className="sr-only">Eventos</legend>
                  {WEBHOOK_EVENTS.map((ev) => (
                    <label key={ev} className="inline-flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={events.includes(ev)}
                        onChange={(e) =>
                          setEvents((cur) =>
                            e.target.checked ? [...cur, ev] : cur.filter((x) => x !== ev),
                          )
                        }
                      />
                      {EVENT_LABEL[ev]}
                    </label>
                  ))}
                </fieldset>
                <Button
                  onClick={() => newHook.mutate()}
                  disabled={!url.trim() || events.length === 0 || newHook.isPending}
                >
                  Añadir webhook
                </Button>
              </div>

              {d.webhooks.length > 0 && (
                <ul className="divide-y divide-border">
                  {d.webhooks.map((w) => (
                    <li key={w.id} className="py-3 space-y-2">
                      <div className="flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{w.url}</p>
                          <p className="text-xs text-muted-foreground">
                            {w.events.map((e) => EVENT_LABEL[e] ?? e).join(", ")}
                            {!w.isActive && " · desactivado"}
                            {w.failureCount > 0 && ` · ${w.failureCount} fallos seguidos`}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={testHook.isPending}
                          onClick={() => testHook.mutate(w.id)}
                        >
                          <Send className="size-3.5 mr-1.5" /> Probar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={toggleHook.isPending}
                          onClick={() => toggleHook.mutate({ id: w.id, isActive: !w.isActive })}
                        >
                          {w.isActive ? "Pausar" : "Activar"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Eliminar webhook"
                          onClick={() => {
                            if (window.confirm("¿Eliminar este webhook y su historial?"))
                              removeHook.mutate(w.id);
                          }}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                      {!w.isActive && w.failureCount >= 20 && (
                        <p className="text-xs text-destructive">
                          Se desactivó solo tras 20 fallos seguidos. Revisa tu servidor y vuelve a
                          activarlo.
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {d.deliveries.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">Últimos envíos</p>
                  <ul className="text-xs space-y-1.5">
                    {d.deliveries.map((x) => (
                      <li key={x.id} className="flex justify-between gap-3">
                        <span className="truncate">
                          {EVENT_LABEL[x.event] ?? x.event} · {fmt(x.createdAt)}
                        </span>
                        <span
                          className={
                            x.status === "sent"
                              ? "text-primary"
                              : x.status === "failed"
                                ? "text-destructive"
                                : "text-muted-foreground"
                          }
                        >
                          {x.status === "sent"
                            ? `Enviado (${x.responseStatus})`
                            : x.status === "failed"
                              ? `Falló: ${x.lastError ?? "—"} · intento ${x.attempts}`
                              : "Pendiente"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
