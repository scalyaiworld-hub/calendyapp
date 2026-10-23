// Cliente mínimo de la API REST de Google (OAuth + Calendar v3) con `fetch`, sin dependencias:
// corre igual en Node y en Cloudflare Workers. `fetchFn` es inyectable para los tests.
import { WEBHOOK_TIMEOUT_MS } from "@/lib/integrations";
import type { GoogleEventBody, GoogleOAuthConfig } from "@/lib/google-calendar";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const API = "https://www.googleapis.com/calendar/v3";

/**
 * auth: token inválido o revocado (hay que reconectar) · not_found: el recurso ya no existe ·
 * forbidden: sin permiso sobre el calendario · retryable: 429/5xx/red · fatal: otro 4xx.
 */
export type GoogleErrorReason = "auth" | "not_found" | "forbidden" | "retryable" | "fatal";
export type GoogleResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number | null; error: string; reason: GoogleErrorReason };

export type TokenResponse = { access_token: string; expires_in: number; refresh_token?: string };
export type GoogleCalendarItem = { id: string; summary: string; primary: boolean };

type ApiError = {
  error?:
    string | { code?: number; message?: string; errors?: { reason?: string }[]; status?: string };
  error_description?: string;
};

function classify(status: number, body: ApiError | null): GoogleErrorReason {
  const err = body?.error;
  if (status === 401 || err === "invalid_grant") return "auth";
  if (status === 404 || status === 410) return "not_found";
  if (status === 429 || status >= 500) return "retryable";
  if (status === 403) {
    const reasons = typeof err === "object" ? (err.errors ?? []).map((e) => e.reason) : [];
    return reasons.some((r) => r === "rateLimitExceeded" || r === "userRateLimitExceeded")
      ? "retryable"
      : "forbidden";
  }
  return "fatal";
}

function describe(status: number, body: ApiError | null): string {
  const err = body?.error;
  const detail =
    typeof err === "string" ? (body?.error_description ?? err) : (err?.message ?? null);
  return detail ? `Google ${status}: ${detail.slice(0, 200)}` : `Google ${status}`;
}

export function createGoogleClient(fetchFn: typeof fetch = fetch) {
  async function call<T>(
    url: string,
    init: { method: string; headers?: Record<string, string>; body?: string },
    parse: (json: any) => T,
  ): Promise<GoogleResult<T>> {
    let res: Response;
    try {
      res = await fetchFn(url, {
        ...init,
        redirect: "manual",
        signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
      });
    } catch (e) {
      const name = (e as Error)?.name;
      return {
        ok: false,
        status: null,
        reason: "retryable",
        error:
          name === "TimeoutError" || name === "AbortError"
            ? "Tiempo de espera agotado"
            : "No se pudo conectar con Google",
      };
    }
    const text = await res.text().catch(() => "");
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (res.status >= 200 && res.status < 300) {
      try {
        return { ok: true, status: res.status, data: parse(json) };
      } catch {
        return {
          ok: false,
          status: res.status,
          reason: "fatal",
          error: "Respuesta inesperada de Google",
        };
      }
    }
    return {
      ok: false,
      status: res.status,
      reason: classify(res.status, json),
      error: describe(res.status, json),
    };
  }

  const form = (params: Record<string, string>) => ({
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  const bearer = (token: string, method: string, body?: unknown) => ({
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const parseToken = (j: any): TokenResponse => {
    if (typeof j?.access_token !== "string") throw new Error("sin access_token");
    return {
      access_token: j.access_token,
      expires_in: Number(j.expires_in) || 3600,
      ...(typeof j.refresh_token === "string" ? { refresh_token: j.refresh_token } : {}),
    };
  };
  const parseEvent = (j: any) => {
    if (typeof j?.id !== "string") throw new Error("sin id");
    return { id: j.id as string };
  };
  const events = (calendarId: string) =>
    `${API}/calendars/${encodeURIComponent(calendarId)}/events`;

  return {
    exchangeCode: (cfg: GoogleOAuthConfig, code: string) =>
      call(
        TOKEN_URL,
        form({
          grant_type: "authorization_code",
          code,
          client_id: cfg.clientId,
          client_secret: cfg.clientSecret,
          redirect_uri: cfg.redirectUri,
        }),
        parseToken,
      ),

    refreshAccessToken: (
      cfg: Pick<GoogleOAuthConfig, "clientId" | "clientSecret">,
      refreshToken: string,
    ) =>
      call(
        TOKEN_URL,
        form({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          client_id: cfg.clientId,
          client_secret: cfg.clientSecret,
        }),
        parseToken,
      ),

    revokeToken: (token: string) => call(REVOKE_URL, form({ token }), () => null),

    getPrimaryCalendarId: (accessToken: string) =>
      call(`${API}/users/me/calendarList/primary`, bearer(accessToken, "GET"), (j) => {
        if (typeof j?.id !== "string") throw new Error("sin id");
        return j.id as string;
      }),

    listWritableCalendars: (accessToken: string) =>
      call(
        `${API}/users/me/calendarList?minAccessRole=writer&maxResults=250`,
        bearer(accessToken, "GET"),
        (j): GoogleCalendarItem[] =>
          ((j?.items ?? []) as any[])
            .filter((c) => typeof c?.id === "string")
            .map((c) => ({
              id: c.id,
              summary: String(c.summaryOverride ?? c.summary ?? c.id),
              primary: c.primary === true,
            })),
      ),

    insertEvent: (accessToken: string, calendarId: string, body: GoogleEventBody) =>
      call(events(calendarId), bearer(accessToken, "POST", body), parseEvent),

    patchEvent: (accessToken: string, calendarId: string, eventId: string, body: GoogleEventBody) =>
      call(
        `${events(calendarId)}/${encodeURIComponent(eventId)}`,
        bearer(accessToken, "PATCH", body),
        parseEvent,
      ),

    deleteEvent: (accessToken: string, calendarId: string, eventId: string) =>
      call(
        `${events(calendarId)}/${encodeURIComponent(eventId)}`,
        bearer(accessToken, "DELETE"),
        () => null,
      ),
  };
}

export type GoogleClient = ReturnType<typeof createGoogleClient>;
