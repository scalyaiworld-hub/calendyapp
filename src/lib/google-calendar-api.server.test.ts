// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createGoogleClient } from "./google-calendar-api.server";
import type { GoogleEventBody, GoogleOAuthConfig } from "./google-calendar";

const json = (status: number, body: unknown) =>
  new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const cfg: GoogleOAuthConfig = {
  clientId: "cid",
  clientSecret: "secret",
  encKey: "k",
  redirectUri: "https://app.test/api/google-calendar/callback",
};
const event = { summary: "Corte — Lucía" } as GoogleEventBody;

function client(...responses: (Response | Error)[]) {
  const fetchFn = vi.fn();
  for (const r of responses)
    r instanceof Error ? fetchFn.mockRejectedValueOnce(r) : fetchFn.mockResolvedValueOnce(r);
  return { fetchFn, google: createGoogleClient(fetchFn as unknown as typeof fetch) };
}
const callOf = (fetchFn: ReturnType<typeof vi.fn>, i = 0) =>
  fetchFn.mock.calls[i] as [string, RequestInit & { headers: Record<string, string> }];

describe("cliente de Google Calendar", () => {
  it("inserta un evento con POST, Bearer y JSON", async () => {
    const { fetchFn, google } = client(json(200, { id: "ev1" }));
    const res = await google.insertEvent("at", "ana@x.com", event);
    expect(res).toEqual({ ok: true, status: 200, data: { id: "ev1" } });
    const [url, init] = callOf(fetchFn);
    expect(url).toBe("https://www.googleapis.com/calendar/v3/calendars/ana%40x.com/events");
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("manual");
    expect(init.headers.Authorization).toBe("Bearer at");
    expect(JSON.parse(init.body as string)).toEqual(event);
  });

  it("actualiza con PATCH y borra con DELETE codificando los ids", async () => {
    const { fetchFn, google } = client(
      json(200, { id: "e/1" }),
      new Response(null, { status: 204 }),
    );
    expect((await google.patchEvent("at", "primary", "e/1", event)).ok).toBe(true);
    expect(callOf(fetchFn, 0)[0]).toBe(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events/e%2F1",
    );
    expect(callOf(fetchFn, 0)[1].method).toBe("PATCH");
    expect(await google.deleteEvent("at", "primary", "e/1")).toEqual({
      ok: true,
      status: 204,
      data: null,
    });
    expect(callOf(fetchFn, 1)[1].method).toBe("DELETE");
  });

  it("clasifica los errores", async () => {
    const { google } = client(
      json(410, { error: { code: 410, message: "Deleted" } }),
      json(404, { error: { code: 404, message: "Not Found" } }),
      json(503, { error: { code: 503, message: "Backend Error" } }),
      json(429, { error: { code: 429, message: "Too many" } }),
      json(403, { error: { code: 403, errors: [{ reason: "rateLimitExceeded" }] } }),
      json(403, { error: { code: 403, errors: [{ reason: "forbidden" }], message: "No" } }),
      json(401, { error: { code: 401, message: "Invalid Credentials" } }),
      json(400, { error: { code: 400, message: "Bad Request" } }),
    );
    const reasons = [];
    for (let i = 0; i < 8; i++) {
      const r = await google.deleteEvent("at", "primary", "e1");
      reasons.push(r.ok ? "ok" : r.reason);
    }
    expect(reasons).toEqual([
      "not_found",
      "not_found",
      "retryable",
      "retryable",
      "retryable",
      "forbidden",
      "auth",
      "fatal",
    ]);
  });

  it("trata timeout y errores de red como reintentables sin filtrar detalles", async () => {
    const timeout = Object.assign(new Error("x"), { name: "TimeoutError" });
    const { google } = client(timeout, new Error("connect ECONNREFUSED 10.0.0.1"));
    expect(await google.deleteEvent("at", "primary", "e1")).toMatchObject({
      ok: false,
      status: null,
      reason: "retryable",
      error: "Tiempo de espera agotado",
    });
    expect(await google.deleteEvent("at", "primary", "e1")).toMatchObject({
      reason: "retryable",
      error: "No se pudo conectar con Google",
    });
  });

  it("canjea el código y refresca el token por formulario", async () => {
    const { fetchFn, google } = client(
      json(200, { access_token: "at", expires_in: 3599, refresh_token: "rt" }),
      json(200, { access_token: "at2", expires_in: 3599 }),
    );
    expect(await google.exchangeCode(cfg, "code-1")).toMatchObject({
      ok: true,
      data: { access_token: "at", refresh_token: "rt" },
    });
    const [url, init] = callOf(fetchFn);
    expect(url).toBe("https://oauth2.googleapis.com/token");
    const body = new URLSearchParams(init.body as string);
    expect(Object.fromEntries(body)).toEqual({
      grant_type: "authorization_code",
      code: "code-1",
      client_id: "cid",
      client_secret: "secret",
      redirect_uri: cfg.redirectUri,
    });
    expect((await google.refreshAccessToken(cfg, "rt")).ok).toBe(true);
    expect(new URLSearchParams(callOf(fetchFn, 1)[1].body as string).get("grant_type")).toBe(
      "refresh_token",
    );
  });

  it("invalid_grant al refrescar es un error de autorización", async () => {
    const { google } = client(json(400, { error: "invalid_grant", error_description: "revoked" }));
    expect(await google.refreshAccessToken(cfg, "rt")).toMatchObject({
      ok: false,
      reason: "auth",
    });
  });

  it("lista solo calendarios con permiso de escritura y lee el principal", async () => {
    const { fetchFn, google } = client(
      json(200, {
        items: [
          { id: "ana@x.com", summary: "Ana", primary: true },
          { id: "c2", summary: "Equipo", summaryOverride: "Equipo (mío)" },
        ],
      }),
      json(200, { id: "ana@x.com", primary: true }),
    );
    expect(await google.listWritableCalendars("at")).toEqual({
      ok: true,
      status: 200,
      data: [
        { id: "ana@x.com", summary: "Ana", primary: true },
        { id: "c2", summary: "Equipo (mío)", primary: false },
      ],
    });
    expect(callOf(fetchFn)[0]).toContain("minAccessRole=writer");
    expect(await google.getPrimaryCalendarId("at")).toMatchObject({ ok: true, data: "ana@x.com" });
    expect(callOf(fetchFn, 1)[0]).toBe(
      "https://www.googleapis.com/calendar/v3/users/me/calendarList/primary",
    );
  });

  it("revoca el token", async () => {
    const { fetchFn, google } = client(new Response(null, { status: 200 }));
    expect((await google.revokeToken("rt")).ok).toBe(true);
    expect(callOf(fetchFn)[0]).toBe("https://oauth2.googleapis.com/revoke");
    expect(new URLSearchParams(callOf(fetchFn)[1].body as string).get("token")).toBe("rt");
  });
});
