// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { encryptToken, decryptToken, type GoogleEventInput } from "./google-calendar";
import type { GoogleClient, GoogleResult } from "./google-calendar-api.server";
import {
  getAccessToken,
  processJob,
  type EventLink,
  type SyncConnection,
  type SyncDeps,
  type SyncJob,
} from "./google-calendar-sync.server";

const KEY = Buffer.alloc(32, 3).toString("base64");
const NOW = new Date("2026-10-23T12:00:00Z");

const ok = <T>(data: T, status = 200): GoogleResult<T> => ({ ok: true, status, data });
const fail = (
  reason: "auth" | "not_found" | "forbidden" | "retryable" | "fatal",
  status: number | null = 500,
): GoogleResult<never> => ({ ok: false, status, reason, error: `Google ${status}` });

function fakeGoogle(overrides: Partial<Record<keyof GoogleClient, ReturnType<typeof vi.fn>>> = {}) {
  return {
    exchangeCode: vi.fn(),
    refreshAccessToken: vi.fn().mockResolvedValue(ok({ access_token: "new-at", expires_in: 3600 })),
    revokeToken: vi.fn().mockResolvedValue(ok(null)),
    getPrimaryCalendarId: vi.fn(),
    listWritableCalendars: vi.fn(),
    insertEvent: vi.fn().mockResolvedValue(ok({ id: "ev-new" })),
    patchEvent: vi.fn().mockResolvedValue(ok({ id: "ev1" })),
    deleteEvent: vi.fn().mockResolvedValue(ok(null, 204)),
    ...overrides,
  };
}

const appointment = (over: Partial<GoogleEventInput & { professionalId: string | null }> = {}) => ({
  id: "a1",
  status: "booked",
  startsAt: "2026-11-02T15:00:00Z",
  endsAt: "2026-11-02T16:00:00Z",
  serviceName: "Corte",
  clientName: "Lucía",
  clientPhone: null,
  professionalName: "Ana",
  notes: null,
  timeZone: "America/Lima",
  professionalId: "p1",
  ...over,
});

function setup(opts: {
  link?: EventLink | null;
  appt?: ReturnType<typeof appointment> | null;
  calendars?: Map<string, string>;
  google?: ReturnType<typeof fakeGoogle>;
}) {
  const links = new Map<string, EventLink>();
  if (opts.link) links.set("a1", opts.link);
  const google = opts.google ?? fakeGoogle();
  const deps: SyncDeps = {
    google: google as unknown as GoogleClient,
    cfg: { clientId: "cid", clientSecret: "cs", encKey: KEY, redirectUri: "https://app.test/cb" },
    now: () => NOW,
    loadAppointment: vi.fn(async () => (opts.appt === undefined ? appointment() : opts.appt)),
    professionalCalendars: vi.fn(async () => opts.calendars ?? new Map()),
    getLink: vi.fn(async (id: string) => links.get(id) ?? null),
    saveLink: vi.fn(async (id: string, _b: string, link: EventLink) => void links.set(id, link)),
    deleteLink: vi.fn(async (id: string) => void links.delete(id)),
    saveAccessToken: vi.fn(async () => {}),
  };
  return { deps, google, links };
}

const conn: SyncConnection = {
  businessId: "b1",
  status: "active",
  refreshTokenEnc: "",
  accessTokenEnc: null,
  accessTokenExpiresAt: null,
  defaultCalendarId: "primary",
};
const job = (action: "upsert" | "delete" = "upsert"): SyncJob => ({
  id: "j1",
  businessId: "b1",
  appointmentId: "a1",
  action,
  attempts: 1,
  version: 1,
});

describe("processJob: upsert", () => {
  it("crea el evento si la cita no tiene vínculo y guarda el vínculo", async () => {
    const { deps, google, links } = setup({});
    expect(await processJob(job(), conn, "at", deps)).toEqual({ kind: "done" });
    expect(google.insertEvent).toHaveBeenCalledWith(
      "at",
      "primary",
      expect.objectContaining({ summary: "Corte — Lucía" }),
    );
    expect(links.get("a1")).toEqual({ calendarId: "primary", googleEventId: "ev-new" });
  });

  it("usa el calendario asignado al profesional", async () => {
    const { deps, google } = setup({ calendars: new Map([["p1", "cal-ana"]]) });
    await processJob(job(), conn, "at", deps);
    expect(google.insertEvent.mock.calls[0][1]).toBe("cal-ana");
  });

  it("actualiza con PATCH si ya existe el vínculo en el mismo calendario", async () => {
    const { deps, google } = setup({ link: { calendarId: "primary", googleEventId: "ev1" } });
    expect(await processJob(job(), conn, "at", deps)).toEqual({ kind: "done" });
    expect(google.patchEvent).toHaveBeenCalledWith("at", "primary", "ev1", expect.any(Object));
    expect(google.insertEvent).not.toHaveBeenCalled();
  });

  it("recrea el evento si el usuario lo borró en Google (PATCH 404)", async () => {
    const google = fakeGoogle({ patchEvent: vi.fn().mockResolvedValue(fail("not_found", 404)) });
    const { deps, links } = setup({
      link: { calendarId: "primary", googleEventId: "ev1" },
      google,
    });
    expect(await processJob(job(), conn, "at", deps)).toEqual({ kind: "done" });
    expect(google.insertEvent).toHaveBeenCalledOnce();
    expect(links.get("a1")?.googleEventId).toBe("ev-new");
  });

  it("mueve el evento si cambió el calendario de destino", async () => {
    const { deps, google, links } = setup({
      link: { calendarId: "primary", googleEventId: "ev1" },
      calendars: new Map([["p1", "cal-ana"]]),
    });
    expect(await processJob(job(), conn, "at", deps)).toEqual({ kind: "done" });
    expect(google.deleteEvent).toHaveBeenCalledWith("at", "primary", "ev1");
    expect(google.insertEvent.mock.calls[0][1]).toBe("cal-ana");
    expect(links.get("a1")).toEqual({ calendarId: "cal-ana", googleEventId: "ev-new" });
  });

  it("si la cita ya no está activa (o no existe) borra el evento", async () => {
    for (const appt of [appointment({ status: "cancelled" }), null]) {
      const { deps, google, links } = setup({
        link: { calendarId: "primary", googleEventId: "ev1" },
        appt,
      });
      expect(await processJob(job(), conn, "at", deps)).toEqual({ kind: "done" });
      expect(google.deleteEvent).toHaveBeenCalledOnce();
      expect(google.insertEvent).not.toHaveBeenCalled();
      expect(links.has("a1")).toBe(false);
    }
  });

  it("traduce los errores de Google a resultados del job", async () => {
    const cases = [
      [fail("retryable", 503), "retry"],
      [fail("forbidden", 403), "failed"],
      [fail("not_found", 404), "failed"],
      [fail("fatal", 400), "failed"],
      [fail("auth", 401), "auth_revoked"],
    ] as const;
    for (const [res, kind] of cases) {
      const google = fakeGoogle({ insertEvent: vi.fn().mockResolvedValue(res) });
      const { deps, links } = setup({ google });
      expect((await processJob(job(), conn, "at", deps)).kind).toBe(kind);
      expect(links.has("a1")).toBe(false);
    }
  });
});

describe("processJob: delete", () => {
  it("borra el evento y el vínculo; 404/410 cuenta como éxito", async () => {
    for (const res of [ok(null, 204), fail("not_found", 410)]) {
      const google = fakeGoogle({ deleteEvent: vi.fn().mockResolvedValue(res) });
      const { deps, links } = setup({
        link: { calendarId: "primary", googleEventId: "ev1" },
        google,
      });
      expect(await processJob(job("delete"), conn, "at", deps)).toEqual({ kind: "done" });
      expect(links.has("a1")).toBe(false);
    }
  });

  it("sin vínculo no llama a Google", async () => {
    const { deps, google } = setup({});
    expect(await processJob(job("delete"), conn, "at", deps)).toEqual({ kind: "done" });
    expect(google.deleteEvent).not.toHaveBeenCalled();
  });

  it("conserva el vínculo si el borrado falla y se reintentará", async () => {
    const google = fakeGoogle({ deleteEvent: vi.fn().mockResolvedValue(fail("retryable", 500)) });
    const { deps, links } = setup({
      link: { calendarId: "primary", googleEventId: "ev1" },
      google,
    });
    expect((await processJob(job("delete"), conn, "at", deps)).kind).toBe("retry");
    expect(links.has("a1")).toBe(true);
  });
});

describe("getAccessToken", () => {
  it("reutiliza el access token vigente", async () => {
    const { deps, google } = setup({});
    const c = {
      ...conn,
      refreshTokenEnc: await encryptToken("rt", KEY),
      accessTokenEnc: await encryptToken("at-vigente", KEY),
      accessTokenExpiresAt: new Date(NOW.getTime() + 30 * 60_000).toISOString(),
    };
    expect(await getAccessToken(c, deps)).toEqual({ ok: true, token: "at-vigente" });
    expect(google.refreshAccessToken).not.toHaveBeenCalled();
  });

  it("refresca el que está por caducar y guarda el nuevo cifrado", async () => {
    const { deps, google } = setup({});
    const c = {
      ...conn,
      refreshTokenEnc: await encryptToken("rt", KEY),
      accessTokenEnc: await encryptToken("at-viejo", KEY),
      accessTokenExpiresAt: new Date(NOW.getTime() + 30_000).toISOString(),
    };
    expect(await getAccessToken(c, deps)).toEqual({ ok: true, token: "new-at" });
    expect(google.refreshAccessToken.mock.calls[0][1]).toBe("rt");
    const [businessId, enc, expiresAt] = (deps.saveAccessToken as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(businessId).toBe("b1");
    expect(await decryptToken(enc, KEY)).toBe("new-at");
    expect(expiresAt).toBe(new Date(NOW.getTime() + 3600_000).toISOString());
  });

  it("invalid_grant marca la conexión como revocada; otros fallos se reintentan", async () => {
    const revoked = fakeGoogle({
      refreshAccessToken: vi.fn().mockResolvedValue(fail("auth", 400)),
    });
    const c = { ...conn, refreshTokenEnc: await encryptToken("rt", KEY) };
    const r1 = await getAccessToken(c, setup({ google: revoked }).deps);
    expect(r1.ok === false && r1.outcome.kind).toBe("auth_revoked");

    const down = fakeGoogle({ refreshAccessToken: vi.fn().mockResolvedValue(fail("retryable")) });
    const r2 = await getAccessToken(c, setup({ google: down }).deps);
    expect(r2.ok === false && r2.outcome.kind).toBe("retry");
  });

  it("si el refresh token no se puede descifrar pide reconectar", async () => {
    const c = { ...conn, refreshTokenEnc: "no.valido" };
    const r = await getAccessToken(c, setup({}).deps);
    expect(r.ok === false && r.outcome.kind).toBe("auth_revoked");
  });
});
