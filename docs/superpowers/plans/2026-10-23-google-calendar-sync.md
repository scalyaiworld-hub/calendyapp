# Sincronización con Google Calendar — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Las citas de Calendya se crean, actualizan y borran como eventos reales en el Google Calendar del negocio.

**Architecture:** OAuth propio por negocio → tokens cifrados en tablas solo de servidor. Un trigger en
`appointments` encola jobs (`google_calendar_jobs`); un endpoint de cron procesa la cola contra la API
REST de Google con `fetch`. La lógica de decisión vive en funciones puras con dependencias inyectadas
para poder testearla sin base de datos ni red.

**Tech Stack:** TanStack Start (server fns + rutas de servidor), Supabase (Postgres, pg_cron), Web Crypto
(AES-GCM, HMAC, HKDF), vitest, React + shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-10-23-google-calendar-sync-design.md`

## Global Constraints

- Runtime Cloudflare Workers: sin `googleapis`, sin `node:crypto` en código de app; `process.env` se lee dentro de funciones.
- Tablas nuevas solo de servidor: RLS activado, sin políticas, `REVOKE ALL … FROM anon, authenticated`, `GRANT ALL … TO service_role`.
- Funciones SQL `SECURITY DEFINER`, `SET search_path = public`, `REVOKE EXECUTE … FROM PUBLIC, anon, authenticated`; el trigger nunca rompe la escritura de la cita (errores → `WARNING`).
- Scopes: `https://www.googleapis.com/auth/calendar.events` y `https://www.googleapis.com/auth/calendar.calendarlist.readonly`.
- Módulo de plan `integrations`; solo el dueño gestiona (`requireOwner`).
- Variables: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_TOKEN_ENC_KEY` (32 bytes base64). Redirect URI = `${getSiteOrigin()}/api/google-calendar/callback` (en local, `SITE_URL=http://localhost:8080`).
- Backoff y límites reutilizados de `src/lib/integrations.ts`: `webhookBackoffMs`, `MAX_DELIVERY_ATTEMPTS` (6), `WEBHOOK_TIMEOUT_MS` (8 s).
- Backfill: citas `pending`/`booked` con `starts_at` entre ahora y +180 días, máx. 2000.
- Textos de UI y comentarios en español; nombres de código en inglés (como el resto del repo).

## Ajustes al spec decididos al planificar

1. **Concurrencia de jobs:** se añade `version integer` a `google_calendar_jobs`. El trigger la incrementa al
   colapsar un cambio; el worker solo marca `done` si la versión no cambió desde que reclamó el job (si cambió, el
   job queda pendiente y se reprocesa con el estado nuevo). El reclamo usa el mismo "arrendamiento" de 5 min que
   los webhooks.
2. **Encolado centralizado en SQL:** `google_calendar_enqueue(business, appointment, action)` hace el
   `INSERT … ON CONFLICT` (PostgREST no soporta `on_conflict` con índice parcial). El trigger y las RPC de backfill
   y borrado masivo la usan.
3. **Email de la cuenta:** se obtiene del calendario `primary` (`calendarList/primary` → `id`), sin pedir scopes de
   perfil.
4. **Desconectar sin borrar eventos:** se conservan los vínculos cita↔evento (`google_calendar_events`); si se vuelve a
   conectar la misma cuenta se hace `PATCH` en lugar de duplicar. El mapeo por profesional sí se borra (los IDs de
   calendario pertenecen a la cuenta anterior).
5. **Worker testeable:** `processJob(job, deps)` recibe un objeto `SyncDeps` (lecturas/escrituras + cliente de
   Google). El adaptador Supabase de `SyncDeps` es fino y no se testea con mocks de cadena.

## File Structure

| Archivo | Responsabilidad |
| --- | --- |
| `supabase/migrations/20261023100000_google_calendar_sync.sql` (crear) | Tablas, índices, funciones de encolado, trigger, cron comentado |
| `src/integrations/supabase/types.ts` (modificar) | Tipos de las 4 tablas y 3 RPC nuevas |
| `src/lib/ics.ts` (modificar) | Extraer `appointmentDescription()` compartida |
| `src/routes/api.public.calendar.$token.ts` (modificar) | Usar `appointmentDescription()` |
| `src/lib/google-calendar.ts` (crear) | Lógica pura: cripto de tokens, `state`, URL de autorización, mapeo cita→evento, calendario destino |
| `src/lib/google-calendar.test.ts` (crear) | Tests de lo anterior |
| `src/lib/google-calendar-api.server.ts` (crear) | Cliente HTTP de Google (token, revoke, calendarList, events) con `fetchFn` inyectable |
| `src/lib/google-calendar-api.server.test.ts` (crear) | Tests del cliente con `fetch` simulado |
| `src/lib/google-calendar-sync.server.ts` (crear) | `getAccessToken`, `processJob`, `syncDueGoogleCalendarJobs` + adaptador Supabase |
| `src/lib/google-calendar-sync.server.test.ts` (crear) | Tests de `getAccessToken`/`processJob` con dependencias falsas en memoria |
| `src/routes/api.public.sync-google-calendar.ts` (crear) | Endpoint del cron |
| `src/routes/api.google-calendar.callback.ts` (crear) | Callback OAuth |
| `src/lib/api/owner-guard.ts` (crear) | `requireOwner` compartido (extraído de integrations.functions.ts) |
| `src/lib/api/integrations.functions.ts` (modificar) | Importar `requireOwner` |
| `src/lib/api/google-calendar.functions.ts` (crear) | Server fns de estado, conexión, calendarios, desconexión |
| `src/components/GoogleCalendarSyncCard.tsx` (crear) | Bloque de UI de la sincronización |
| `src/routes/dashboard.integraciones.tsx` (modificar) | Montar la tarjeta, separar el bloque ICS, toast del callback |
| `.env.example` (modificar) | Documentar variables nuevas |

---

### Task 1: Migración y tipos

**Files:** crear la migración; modificar `src/integrations/supabase/types.ts`.

**Produces:**
- Tablas `google_calendar_connections`, `google_calendar_professional_map`, `google_calendar_events`, `google_calendar_jobs` (columnas del spec §2 + `version integer NOT NULL DEFAULT 1` y `updated_at` en jobs).
- `google_calendar_enqueue(p_business_id uuid, p_appointment_id uuid, p_action text) RETURNS void`.
- `google_calendar_enqueue_upcoming(p_business_id uuid, p_mode text, p_professional_id uuid DEFAULT NULL) RETURNS integer` — `p_mode` ∈ `all` (todas), `default` (sin profesional o con profesional sin mapeo), `professional` (las de `p_professional_id`).
- `google_calendar_enqueue_delete_all(p_business_id uuid) RETURNS integer` — un `delete` por cada fila de `google_calendar_events` del negocio.
- Trigger `appointments_enqueue_google_calendar` AFTER INSERT/UPDATE/DELETE.

- [ ] Escribir la migración (ver spec §2–§3 y ajustes 1–2).
- [ ] Añadir los tipos `Row/Insert/Update/Relationships` de las 4 tablas y las 3 funciones en `Functions`.
- [ ] `npx tsc --noEmit` → sin errores. Commit.

### Task 2: Descripción compartida del evento

**Files:** `src/lib/ics.ts`, `src/routes/api.public.calendar.$token.ts`, test en `src/lib/integrations.test.ts` (donde ya se testea ics) o nuevo `src/lib/ics.test.ts`.

**Produces:** `appointmentDescription(input: { phone?: string | null; professional?: string | null; notes?: string | null }): string` — líneas `Tel: …`, `Profesional: …`, `Notas: …` unidas por `\n`, omitiendo vacías.

- [ ] Test: todas las líneas; solo notas; nada → `""`.
- [ ] Implementar y usar en el feed. Tests en verde. Commit.

### Task 3: Lógica pura de Google Calendar

**Files:** `src/lib/google-calendar.ts`, `src/lib/google-calendar.test.ts`.

**Produces:**
```ts
export const GOOGLE_SCOPES: string[];
export const BACKFILL_DAYS = 180;
export type GoogleOAuthConfig = { clientId: string; clientSecret: string; encKey: string; redirectUri: string };
export async function encryptToken(plain: string, encKeyB64: string): Promise<string>;   // "iv.ct" base64url
export async function decryptToken(enc: string, encKeyB64: string): Promise<string>;      // lanza si no cuadra
export type OAuthState = { businessId: string; userId: string; exp: number; nonce: string };
export async function signState(s: Omit<OAuthState, "nonce" | "exp">, encKeyB64: string, now?: number): Promise<string>;
export async function verifyState(token: string, encKeyB64: string, now?: number): Promise<OAuthState | null>;
export function buildAuthUrl(cfg: Pick<GoogleOAuthConfig, "clientId" | "redirectUri">, state: string): string;
export type GoogleEventInput = { id: string; status: string; startsAt: string; endsAt: string; serviceName: string | null; clientName: string | null; clientPhone: string | null; professionalName: string | null; notes: string | null; timeZone: string; sourceUrl?: string | null };
export type GoogleEventBody = { summary: string; description: string; start: { dateTime: string; timeZone: string }; end: { dateTime: string; timeZone: string }; status: "confirmed" | "tentative"; extendedProperties: { private: { calendyaAppointmentId: string } }; reminders: { useDefault: true }; source?: { title: string; url: string } };
export function toGoogleEvent(a: GoogleEventInput): GoogleEventBody;
export function pickTargetCalendar(professionalId: string | null, map: Map<string, string>, defaultCalendarId: string): string;
export function isActiveForSync(status: string): boolean; // pending | booked | completed
```

Tests: ida y vuelta de cifrado; IV distinto; clave errónea lanza; `state` válido/caducado/firma alterada/payload alterado; `buildAuthUrl` incluye `access_type=offline`, `prompt=consent`, scopes y `state`; `toGoogleEvent` (summary con valores por defecto "Cita"/"Cliente", tentative para pending, zona horaria, descripción, sin `source` si no hay URL); `pickTargetCalendar` con/sin mapeo.

- [ ] Tests primero → fallan. Implementar → pasan. Commit.

### Task 4: Cliente HTTP de Google

**Files:** `src/lib/google-calendar-api.server.ts`, `src/lib/google-calendar-api.server.test.ts`.

**Produces:**
```ts
export type GoogleResult<T> = { ok: true; status: number; data: T } | { ok: false; status: number | null; error: string; reason: "auth" | "not_found" | "forbidden" | "retryable" | "fatal" };
export type TokenResponse = { access_token: string; expires_in: number; refresh_token?: string };
export function createGoogleClient(fetchFn?: typeof fetch): {
  exchangeCode(cfg: GoogleOAuthConfig, code: string): Promise<GoogleResult<TokenResponse>>;
  refreshAccessToken(cfg: Pick<GoogleOAuthConfig,"clientId"|"clientSecret">, refreshToken: string): Promise<GoogleResult<TokenResponse>>;
  revokeToken(token: string): Promise<GoogleResult<null>>;
  getPrimaryCalendarId(accessToken: string): Promise<GoogleResult<string>>;
  listWritableCalendars(accessToken: string): Promise<GoogleResult<{ id: string; summary: string; primary: boolean }[]>>;
  insertEvent(accessToken: string, calendarId: string, body: GoogleEventBody): Promise<GoogleResult<{ id: string }>>;
  patchEvent(accessToken: string, calendarId: string, eventId: string, body: GoogleEventBody): Promise<GoogleResult<{ id: string }>>;
  deleteEvent(accessToken: string, calendarId: string, eventId: string): Promise<GoogleResult<null>>;
};
export type GoogleClient = ReturnType<typeof createGoogleClient>;
```
Clasificación: 401 o `invalid_grant` → `auth`; 404/410 → `not_found`; 403 (salvo `rateLimitExceeded`/`userRateLimitExceeded` → `retryable`) → `forbidden`; 429/5xx/timeout/red → `retryable`; otros 4xx → `fatal`. Todas las llamadas con `AbortSignal.timeout(WEBHOOK_TIMEOUT_MS)` y `redirect: "manual"`; calendarId y eventId con `encodeURIComponent`.

- [ ] Tests (fetch simulado): insert → POST a la URL correcta con Bearer y JSON; delete 410 → `not_found`; 503 → `retryable`; refresh con `invalid_grant` → `auth`; 403 rateLimit → `retryable`; timeout → `retryable`; `listWritableCalendars` usa `minAccessRole=writer`.
- [ ] Implementar. Commit.

### Task 5: Worker de sincronización

**Files:** `src/lib/google-calendar-sync.server.ts`, `src/lib/google-calendar-sync.server.test.ts`.

**Produces:**
```ts
export type SyncJob = { id: string; businessId: string; appointmentId: string; action: "upsert" | "delete"; attempts: number; version: number };
export type SyncConnection = { businessId: string; status: string; refreshTokenEnc: string; accessTokenEnc: string | null; accessTokenExpiresAt: string | null; defaultCalendarId: string; timeZone: string };
export type EventLink = { calendarId: string; googleEventId: string };
export type SyncDeps = {
  google: GoogleClient;
  cfg: GoogleOAuthConfig;
  now: () => Date;
  loadAppointment(id: string): Promise<GoogleEventInput & { professionalId: string | null } | null>;
  professionalCalendars(businessId: string): Promise<Map<string, string>>;
  getLink(appointmentId: string): Promise<EventLink | null>;
  saveLink(appointmentId: string, businessId: string, link: EventLink): Promise<void>;
  deleteLink(appointmentId: string): Promise<void>;
  saveAccessToken(businessId: string, enc: string, expiresAt: string): Promise<void>;
};
export type JobOutcome = { kind: "done" } | { kind: "retry"; error: string } | { kind: "failed"; error: string } | { kind: "auth_revoked"; error: string };
export async function getAccessToken(conn: SyncConnection, deps: SyncDeps): Promise<{ ok: true; token: string } | { ok: false; outcome: JobOutcome }>;
export async function processJob(job: SyncJob, conn: SyncConnection, accessToken: string, deps: SyncDeps): Promise<JobOutcome>;
export async function syncDueGoogleCalendarJobs(admin: Admin, now?: Date, fetchFn?: typeof fetch): Promise<{ due: number; done: number; retried: number; failed: number; skipped: number }>;
```

`processJob`: reglas del spec §4 (upsert/insert/patch/mover/recrear; delete con 404/410 = éxito; cita inexistente o inactiva ⇒ delete).
`syncDueGoogleCalendarJobs`: lee hasta 50 jobs pendientes vencidos; agrupa por negocio; carga conexión + plan;
sin módulo o conexión inactiva ⇒ `failed`; reclama cada job (lease 5 min, `eq attempts`); obtiene token una vez por
negocio; aplica `JobOutcome` (done con `eq version`; retry con `webhookBackoffMs`, `failed` al llegar a
`MAX_DELIVERY_ATTEMPTS`; `auth_revoked` ⇒ conexión `revoked` + todos los pendientes del negocio `failed`); actualiza
`last_synced_at`/`last_error`. Después, para cada conexión `disconnecting` sin jobs pendientes: revoca el token y borra
conexión y mapeo.

Tests (deps en memoria): POST para cita nueva y vínculo guardado; PATCH si hay vínculo; PATCH 404 ⇒ POST; cambio de
calendario ⇒ DELETE + POST; delete 404 ⇒ done y vínculo borrado; delete sin vínculo ⇒ done sin llamar a Google; cita
cancelada en un job upsert ⇒ delete; 503 ⇒ retry; 403 ⇒ failed; 401 ⇒ auth_revoked; `getAccessToken` reutiliza el
token vigente, refresca el que caduca en <60 s y guarda el nuevo cifrado, `invalid_grant` ⇒ auth_revoked.

- [ ] Tests primero. Implementar. Commit.

### Task 6: Rutas de servidor (cron y callback OAuth)

**Files:** `src/routes/api.public.sync-google-calendar.ts`, `src/routes/api.google-calendar.callback.ts`; añadir `loadGoogleOAuthConfig(): Promise<GoogleOAuthConfig | null>` en `src/lib/google-calendar-sync.server.ts` (lee env + `getSiteOrigin`).

Cron: igual que `api.public.send-webhooks.ts`. Callback (`GET`): `error` de Google o falta de `code`/`state` ⇒ redirige a
`/dashboard/integraciones?google=error`; `verifyState`; revalida dueño (`businesses.owner_id = state.userId`,
`deleted_at is null`) y módulo; `exchangeCode`; exige `refresh_token`; `getPrimaryCalendarId` como email; upsert de la
conexión (status `active`, `default_calendar_id = 'primary'`, `last_error = null`, `delete_events_on_disconnect = false`);
borra el mapeo de profesionales si cambió la cuenta; RPC `google_calendar_enqueue_upcoming(mode 'all')`; redirige con
`?google=connected`. Respuestas 302 con `Cache-Control: no-store`.

- [ ] Implementar; regenerar `routeTree.gen.ts` con el build/dev (o `npx tsr generate`). `tsc` limpio. Commit.

### Task 7: Server functions

**Files:** `src/lib/api/owner-guard.ts`, `src/lib/api/integrations.functions.ts`, `src/lib/api/google-calendar.functions.ts`.

**Produces:**
```ts
export type GoogleCalendarStatus = { configured: boolean; connection: null | { email: string; status: "active"|"revoked"|"error"|"disconnecting"; defaultCalendarId: string; lastSyncedAt: string|null; lastError: string|null; connectedAt: string }; professionals: { id: string; name: string; calendarId: string | null }[]; failedJobs: number; pendingJobs: number };
getGoogleCalendarStatus({ businessId }): GoogleCalendarStatus
startGoogleCalendarConnect({ businessId }): { url: string }
listGoogleCalendars({ businessId }): { id: string; summary: string; primary: boolean }[]
setDefaultCalendar({ businessId, calendarId }): { ok: true }
setProfessionalCalendar({ businessId, professionalId, calendarId: string | null }): { ok: true }
disconnectGoogleCalendar({ businessId, deleteEvents: boolean }): { ok: true }
```
`listGoogleCalendars` obtiene token con `getAccessToken` (adaptador Supabase). `setDefaultCalendar`/`setProfessionalCalendar`
validan que el calendario está en la lista de escribibles y encolan backfill (`default` / `professional`). Desconectar sin
borrar: revoca, borra conexión, mapeo y jobs pendientes. Con borrado: `status='disconnecting'`, borra jobs pendientes,
RPC `google_calendar_enqueue_delete_all`.

- [ ] Extraer `requireOwner`, implementar las server fns. `tsc` + tests. Commit.

### Task 8: Interfaz

**Files:** `src/components/GoogleCalendarSyncCard.tsx`, `src/routes/dashboard.integraciones.tsx`.

Estados del spec §6. Selects de shadcn (`@/components/ui/select`) para calendario por defecto y por profesional
(valor especial `__default__` = usar el predeterminado). `AlertDialog` + `Checkbox` para desconectar. Toast según
`?google=connected|error` y luego limpiar el parámetro con `window.history.replaceState`. El bloque ICS pasa a titularse
"Suscripción por URL (ICS)". Mientras `status==='disconnecting'` o haya jobs pendientes, `refetchInterval` de 5 s.

- [ ] Implementar. `npm run lint`, `tsc`, tests. Arrancar `npm run dev` y abrir `/dashboard/integraciones` para comprobar que renderiza sin errores. Commit.

### Task 9: Documentación y cierre

**Files:** `.env.example`, `README.md` (sección de integraciones si existe).

- [ ] Documentar variables, pasos de Google Cloud, cron y verificación de la app.
- [ ] Suite completa (`npx vitest run`, `npx tsc --noEmit`, `npm run lint`, `npm run build`). Push. Abrir PR.
