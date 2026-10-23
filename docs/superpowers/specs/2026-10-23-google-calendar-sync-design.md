# Sincronización con Google Calendar (Calendya → Google)

Fecha: 2026-10-23 · Estado: diseño aprobado, pendiente de plan de implementación

## Objetivo

Que cada cita creada, movida o cancelada en Calendya aparezca como un **evento real** en el Google
Calendar del negocio, sin depender del feed ICS (que Google refresca con horas de retraso).

Alcance: **solo Calendya → Google**. No se leen eventos de Google ni se bloquea disponibilidad con
ellos (queda para una fase posterior).

## Decisiones

| Tema | Decisión |
| --- | --- |
| Dirección | Unidireccional, Calendya → Google |
| Quién conecta | Una cuenta de Google **por negocio** (el dueño). Calendario por defecto + calendario opcional por profesional, de esa misma cuenta |
| Entrega | Outbox en base de datos + cron cada minuto (mismo patrón que los webhooks) |
| Plan | Módulo `integrations` (Studio), igual que el feed ICS |
| Contenido del evento | Servicio, cliente, teléfono, profesional y notas (igual que el feed ICS) |
| Alcance inicial | Al conectar se sincronizan las citas futuras activas (hasta 180 días); no el historial |
| Feed ICS | Se mantiene como alternativa (Apple/Outlook) |
| Tokens | Refresh y access token cifrados con AES-GCM en tabla solo de servidor |
| Librería | Ninguna: `fetch` directo a la API REST de Google (runtime Cloudflare Workers) |

Latencia aceptada: hasta ~60 s entre el cambio de la cita y su reflejo en Google.

## 1. Conexión OAuth

OAuth propio, **independiente del login con Google de Supabase**: funciona aunque el dueño entre
con email/contraseña y permite conectar una cuenta de Google distinta.

Scopes (mínimos):

- `https://www.googleapis.com/auth/calendar.events` — crear, editar y borrar eventos.
- `https://www.googleapis.com/auth/calendar.calendarlist.readonly` — listar calendarios para elegir destino.

Flujo:

1. En *Integraciones*, el dueño pulsa **Conectar Google Calendar**.
2. `startGoogleCalendarConnect` (server fn) comprueba dueño + plan (`requireOwner`), genera un
   `state` firmado con HMAC-SHA256 (`businessId`, `userId`, nonce, expiración a 10 min) y devuelve
   la URL de autorización de Google con `access_type=offline`, `prompt=consent`,
   `include_granted_scopes=true`.
3. Google redirige a `GET /api/google-calendar/callback?code&state`. La ruta:
   - valida firma y expiración del `state`; vuelve a comprobar que el usuario sigue siendo dueño y
     el plan sigue incluyendo el módulo;
   - canjea el `code` en `https://oauth2.googleapis.com/token`;
   - obtiene el email de la cuenta (`id_token` o `userinfo`) y el calendario principal;
   - hace upsert en `google_calendar_connections` (`status='active'`,
     `default_calendar_id='primary'`, tokens cifrados);
   - encola el backfill (ver §3) y redirige a `/dashboard/integraciones?google=connected`
     (o `?google=error&reason=…` ante cualquier fallo, sin exponer detalles).
4. Si Google no devuelve `refresh_token` (no debería con `prompt=consent`), se considera error.

## 2. Modelo de datos

Migración nueva `supabase/migrations/20261023100000_google_calendar_sync.sql`. Todas las tablas son
**solo de servidor**: RLS activado, sin políticas, `REVOKE ALL … FROM anon, authenticated`,
`GRANT ALL … TO service_role` (igual que `calendar_feeds`).

```sql
google_calendar_connections (
  business_id            uuid PK → businesses ON DELETE CASCADE,
  google_email           text NOT NULL,
  refresh_token_enc      text NOT NULL,
  access_token_enc       text,
  access_token_expires_at timestamptz,
  default_calendar_id    text NOT NULL DEFAULT 'primary',
  status                 text NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active','revoked','error','disconnecting')),
  delete_events_on_disconnect boolean NOT NULL DEFAULT false,
  last_error             text,
  last_synced_at         timestamptz,
  connected_by           uuid → auth.users ON DELETE SET NULL,
  connected_at           timestamptz NOT NULL DEFAULT now()
)

google_calendar_professional_map (
  professional_id uuid PK → professionals ON DELETE CASCADE,
  business_id     uuid NOT NULL → businesses ON DELETE CASCADE,
  calendar_id     text NOT NULL
)

google_calendar_events (          -- vínculo cita ↔ evento de Google
  appointment_id  uuid PK,        -- sin FK: debe sobrevivir al borrado de la cita
  business_id     uuid NOT NULL → businesses ON DELETE CASCADE,
  calendar_id     text NOT NULL,
  google_event_id text NOT NULL,
  synced_at       timestamptz NOT NULL DEFAULT now()
)

google_calendar_jobs (            -- outbox
  id              uuid PK,
  business_id     uuid NOT NULL → businesses ON DELETE CASCADE,
  appointment_id  uuid NOT NULL,  -- sin FK, por el mismo motivo
  action          text NOT NULL CHECK (action IN ('upsert','delete')),
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','failed')),
  attempts        integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error      text,
  created_at, updated_at timestamptz
)
-- UNIQUE (appointment_id) WHERE status = 'pending'  → un solo job pendiente por cita
-- INDEX (next_attempt_at) WHERE status = 'pending'
```

Los jobs `done` se purgan con un `cron.schedule` opcional (comentado en la migración) a los 7 días.

### Variables de entorno

| Variable | Uso |
| --- | --- |
| `GOOGLE_OAUTH_CLIENT_ID` | Cliente OAuth de Google Cloud |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Ídem |
| `GOOGLE_TOKEN_ENC_KEY` | 32 bytes en base64. Clave AES-GCM para los tokens; de ella se deriva (HKDF) la clave HMAC del `state` |

Se leen siempre dentro de funciones (en Workers, `process.env` se enlaza por petición). Si falta
alguna, la tarjeta de Google muestra "No configurado" y las server fns responden con error claro.

## 3. Encolado (trigger)

`public.enqueue_google_calendar_job()` — `SECURITY DEFINER`, `search_path = public`, cualquier
error se degrada a `WARNING` (nunca rompe la escritura de la cita). `REVOKE EXECUTE` de `PUBLIC`,
`anon`, `authenticated`.

Disparado `AFTER INSERT OR UPDATE OR DELETE ON appointments FOR EACH ROW`:

- **Camino rápido:** si no hay fila en `google_calendar_connections` con `status='active'` para el
  negocio, no hace nada.
- `DELETE`, o `status` pasa a `cancelled`/`no_show` → acción `delete`.
- `INSERT`, o cambia alguno de `status`, `starts_at`, `ends_at`, `professional_id`, `service_id`,
  `client_id`, `notes` → acción `upsert`.
- Otros cambios → nada.
- Inserta con `ON CONFLICT (appointment_id) WHERE status='pending' DO UPDATE SET action = EXCLUDED.action,
  next_attempt_at = now(), attempts = 0`: ediciones seguidas se colapsan en una sola llamada.

Encolado desde la aplicación (no trigger):

- **Backfill** al conectar o al cambiar el calendario por defecto / el de un profesional: un
  `upsert` por cada cita de ese alcance con `status IN ('pending','booked')` y `starts_at` entre
  ahora y +180 días (límite 2000, como el feed).
- **Cambio de datos del cliente o del servicio** (nombre/teléfono): fuera de alcance; el evento se
  actualizará en el siguiente cambio de la cita.

## 4. Worker

`src/lib/google-calendar.server.ts` → `syncDueGoogleCalendarJobs(admin, fetchFn = fetch)`, llamado
por `POST /api/public/sync-google-calendar` (autenticado con `checkCronAuth`, cron cada minuto).

1. Toma hasta 50 jobs `pending` con `next_attempt_at <= now()`, agrupados por negocio.
2. Por negocio carga la conexión. Si el negocio perdió el módulo `integrations` o la conexión no está
   `active`/`disconnecting`, marca sus jobs `failed` con motivo y sigue.
3. Obtiene un access token válido: si falta o caduca en < 60 s, lo refresca con el refresh token y
   guarda el nuevo cifrado. `invalid_grant` → conexión `revoked`, `last_error`, jobs del negocio
   `failed`; no se reintenta.
4. **upsert:** lee la cita con cliente, servicio, profesional y la zona horaria del negocio. Si ya no
   existe o está cancelada/no_show, se trata como `delete`. Calendario destino =
   `google_calendar_professional_map.calendar_id` del profesional o `default_calendar_id`.
   - Sin vínculo en `google_calendar_events` → `POST /calendars/{cal}/events`, guarda el vínculo.
   - Vínculo con el mismo calendario → `PATCH /calendars/{cal}/events/{id}`. Si responde 404/410
     (el usuario lo borró en Google), se recrea con `POST`.
   - Vínculo con otro calendario → `DELETE` en el viejo (404/410 cuenta como éxito) y `POST` en el
     nuevo.
5. **delete:** si hay vínculo, `DELETE /calendars/{cal}/events/{id}` (404/410 = éxito) y borra el
   vínculo. Sin vínculo → `done`.
6. Resultado:
   - éxito → job `done`, `last_synced_at = now()` en la conexión;
   - 429, 5xx, timeout o error de red → `attempts + 1`, `next_attempt_at` con `webhookBackoffMs`
     (1 min, 5 min, 30 min, 2 h, 6 h); tras `MAX_DELIVERY_ATTEMPTS` (6) → `failed`;
   - 401 tras refrescar → como `invalid_grant`; 403 sin permiso sobre el calendario → `failed` con
     motivo visible en la UI.
7. **Desconexión con borrado:** si la conexión está `disconnecting` y no le quedan jobs `pending`,
   revoca el token (`POST https://oauth2.googleapis.com/revoke`), borra la conexión, el mapeo de
   profesionales y los vínculos de eventos.

Timeout por llamada: `WEBHOOK_TIMEOUT_MS` (8 s). Las llamadas solo van a hosts fijos de Google, sin
URLs controladas por el usuario.

### Mapeo cita → evento (lógica pura, `src/lib/google-calendar.ts`)

```ts
{
  summary: `${servicio ?? "Cita"} — ${cliente ?? "Cliente"}`,
  description: "Tel: …\nProfesional: …\nNotas: …",     // mismas líneas que el feed ICS
  start: { dateTime: ISO, timeZone: business.timezone },
  end:   { dateTime: ISO, timeZone: business.timezone },
  status: cita.status === "pending" ? "tentative" : "confirmed",
  extendedProperties: { private: { calendyaAppointmentId: cita.id } },
  reminders: { useDefault: true },
  source: { title: "Calendya", url: `${origen}/dashboard/citas` },
}
```

Sin `attendees`: el cliente nunca recibe correos de Google. La construcción de la descripción se
extrae a una función compartida con el feed ICS para que ambos formatos no diverjan.

Utilidades puras en el mismo módulo: `encryptToken`/`decryptToken` (AES-GCM, IV aleatorio, salida
`base64(iv).base64(ciphertext)`), `signState`/`verifyState`, `buildAuthUrl`, `pickTargetCalendar`.

## 5. Server functions

`src/lib/api/google-calendar.functions.ts`. Todas comprueban dueño + módulo con `requireOwner`
(se extrae de `integrations.functions.ts` a un helper compartido).

| Función | Qué hace |
| --- | --- |
| `getGoogleCalendarStatus` | Estado de la conexión (email, calendario por defecto, mapeo por profesional, `last_synced_at`, `last_error`, nº de jobs `failed` recientes, si está configurado) |
| `startGoogleCalendarConnect` | Devuelve la URL de autorización |
| `listGoogleCalendars` | Lista los calendarios de la cuenta en los que puede escribir (`minAccessRole=writer`) |
| `setDefaultCalendar` | Cambia el calendario por defecto y encola backfill de las citas sin profesional mapeado |
| `setProfessionalCalendar` | Asigna o quita (`null` = usar el predeterminado) el calendario de un profesional y encola backfill de sus citas |
| `disconnectGoogleCalendar` | `{ deleteEvents: boolean }`. Sin borrado: revoca y borra la conexión al momento. Con borrado: `status='disconnecting'`, encola `delete` por cada vínculo; el worker termina |

## 6. Interfaz

En [dashboard.integraciones.tsx](../../../src/routes/dashboard.integraciones.tsx), la tarjeta
"Google Calendar y otros calendarios" se divide en dos bloques:

1. **Sincronización con Google Calendar** (nuevo)
   - Sin configurar (faltan variables de entorno): texto informativo, sin botón.
   - Desconectado: descripción breve + **Conectar Google Calendar**.
   - Conectado: cuenta, selector de calendario por defecto, lista de profesionales activos con su
     selector ("Usar el predeterminado"), última sincronización, último error si lo hay, y
     **Desconectar** (diálogo con casilla "Borrar también los eventos creados en Google").
   - Revocado/error: aviso + **Reconectar**.
   - Desconectando: "Borrando eventos de Google…".
   - Al volver del callback, toast según `?google=connected|error`.
2. **Suscripción por URL (ICS)** — el bloque actual, sin cambios funcionales, presentado como
   alternativa para Apple Calendar y Outlook.

Componentes del design system existente (Card, Select, Button, AlertDialog, Checkbox). Textos en
español, como el resto del panel.

## 7. Tests (vitest)

`src/lib/google-calendar.test.ts` — lógica pura:

- mapeo cita → evento: zona horaria, `tentative` vs `confirmed`, descripción, valores ausentes;
- `signState`/`verifyState`: válido, caducado, firma alterada, payload alterado;
- `encryptToken`/`decryptToken`: ida y vuelta; IV distinto en cada cifrado; clave incorrecta falla;
- `pickTargetCalendar`: con y sin mapeo.

`src/lib/google-calendar.server.test.ts` — worker con `fetchFn` y cliente admin simulados:

- cita nueva → POST y vínculo guardado;
- cita existente → PATCH; PATCH 404 → POST;
- cambio de profesional con otro calendario → DELETE + POST;
- delete con 404/410 → `done`;
- 5xx/429 → reintento con backoff; al 6º intento → `failed`;
- token por caducar → refresco y guardado;
- `invalid_grant` → conexión `revoked`, jobs `failed`;
- negocio sin módulo → jobs `failed`;
- `disconnecting` sin jobs pendientes → revoca y borra.

## 8. Despliegue

1. Google Cloud Console: crear el cliente OAuth (tipo *Web*), redirect URI
   `https://TU-DOMINIO/api/google-calendar/callback`, habilitar *Google Calendar API*, pantalla de
   consentimiento con los dos scopes.
2. Cargar `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_TOKEN_ENC_KEY` en el
   entorno (Cloudflare).
3. Aplicar la migración y programar a mano el cron (comentado en la migración, sin guardar el
   secreto en el repo):
   `cron.schedule('sync-google-calendar', '* * * * *', net.http_post(…/api/public/sync-google-calendar…))`.
4. Regenerar `src/integrations/supabase/types.ts`.
5. **Verificación de Google:** `calendar.events` es un scope sensible. Hasta pasar la verificación de
   la app, solo los usuarios de prueba añadidos en la consola pueden conectar (máx. 100). Iniciar la
   verificación cuanto antes; puede tardar semanas y requiere política de privacidad y dominio
   verificado.

## Fuera de alcance

- Google → Calendya (bloquear disponibilidad con eventos de Google, push notifications/`watch`).
- Una cuenta de Google por profesional.
- Sincronizar el historial de citas pasadas.
- Actualizar eventos cuando cambian solo los datos del cliente o del servicio.
