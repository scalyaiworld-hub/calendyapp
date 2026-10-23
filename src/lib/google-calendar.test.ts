// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  GOOGLE_SCOPES,
  buildAuthUrl,
  decryptToken,
  encryptToken,
  isActiveForSync,
  pickTargetCalendar,
  signState,
  toGoogleEvent,
  verifyState,
  type GoogleEventInput,
} from "./google-calendar";

const KEY = Buffer.alloc(32, 7).toString("base64");
const OTHER_KEY = Buffer.alloc(32, 9).toString("base64");

describe("cifrado de tokens", () => {
  it("cifra y descifra (ida y vuelta)", async () => {
    const enc = await encryptToken("1//refresh-token", KEY);
    expect(enc).not.toContain("refresh");
    expect(await decryptToken(enc, KEY)).toBe("1//refresh-token");
  });

  it("usa un IV distinto en cada cifrado", async () => {
    expect(await encryptToken("x", KEY)).not.toBe(await encryptToken("x", KEY));
  });

  it("falla con otra clave o con el texto alterado", async () => {
    const enc = await encryptToken("secreto", KEY);
    await expect(decryptToken(enc, OTHER_KEY)).rejects.toThrow();
    const [iv, ct] = enc.split(".");
    const tampered = `${iv}.${ct.slice(0, -2)}${ct.endsWith("A") ? "BB" : "AA"}`;
    await expect(decryptToken(tampered, KEY)).rejects.toThrow();
  });

  it("rechaza una clave que no mide 32 bytes", async () => {
    await expect(encryptToken("x", Buffer.alloc(16).toString("base64"))).rejects.toThrow(
      /32 bytes/,
    );
  });
});

describe("state de OAuth", () => {
  const now = 1_800_000_000_000;
  const payload = { businessId: "b1", userId: "u1" };

  it("verifica un state válido", async () => {
    const state = await signState(payload, KEY, now);
    expect(await verifyState(state, KEY, now + 60_000)).toMatchObject(payload);
  });

  it("rechaza un state caducado (10 min)", async () => {
    const state = await signState(payload, KEY, now);
    expect(await verifyState(state, KEY, now + 11 * 60_000)).toBeNull();
  });

  it("rechaza firma o contenido alterados y otra clave", async () => {
    const state = await signState(payload, KEY, now);
    const [body, sig] = state.split(".");
    const forged = Buffer.from(
      JSON.stringify({
        ...JSON.parse(Buffer.from(body, "base64url").toString()),
        businessId: "b2",
      }),
    ).toString("base64url");
    expect(await verifyState(`${forged}.${sig}`, KEY, now)).toBeNull();
    expect(await verifyState(`${body}.${sig.slice(0, -1)}A`, KEY, now)).toBeNull();
    expect(await verifyState(state, OTHER_KEY, now)).toBeNull();
    expect(await verifyState("basura", KEY, now)).toBeNull();
  });
});

describe("buildAuthUrl", () => {
  it("pide acceso offline con consentimiento y los scopes mínimos", () => {
    const url = new URL(
      buildAuthUrl({ clientId: "cid", redirectUri: "https://app.test/cb" }, "st"),
    );
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    const p = url.searchParams;
    expect(p.get("client_id")).toBe("cid");
    expect(p.get("redirect_uri")).toBe("https://app.test/cb");
    expect(p.get("response_type")).toBe("code");
    expect(p.get("access_type")).toBe("offline");
    expect(p.get("prompt")).toBe("consent");
    expect(p.get("state")).toBe("st");
    expect(p.get("scope")?.split(" ")).toEqual(GOOGLE_SCOPES);
  });
});

describe("toGoogleEvent", () => {
  const base: GoogleEventInput = {
    id: "a1",
    status: "booked",
    startsAt: "2026-11-02T15:00:00+00:00",
    endsAt: "2026-11-02T16:00:00+00:00",
    serviceName: "Corte",
    clientName: "Lucía",
    clientPhone: "+51 999",
    professionalName: "Ana",
    notes: null,
    timeZone: "America/Lima",
    sourceUrl: "https://app.test/dashboard/citas",
  };

  it("mapea una cita confirmada", () => {
    expect(toGoogleEvent(base)).toEqual({
      summary: "Corte — Lucía",
      description: "Tel: +51 999\nProfesional: Ana",
      start: { dateTime: "2026-11-02T15:00:00.000Z", timeZone: "America/Lima" },
      end: { dateTime: "2026-11-02T16:00:00.000Z", timeZone: "America/Lima" },
      status: "confirmed",
      extendedProperties: { private: { calendyaAppointmentId: "a1" } },
      reminders: { useDefault: true },
      source: { title: "Calendya", url: "https://app.test/dashboard/citas" },
    });
  });

  it("usa valores por defecto, marca pending como tentative y omite source sin URL", () => {
    const ev = toGoogleEvent({
      ...base,
      status: "pending",
      serviceName: null,
      clientName: null,
      clientPhone: null,
      professionalName: null,
      sourceUrl: null,
    });
    expect(ev.summary).toBe("Cita — Cliente");
    expect(ev.status).toBe("tentative");
    expect(ev.description).toBe("");
    expect(ev).not.toHaveProperty("source");
    expect(ev).not.toHaveProperty("attendees");
  });
});

describe("pickTargetCalendar e isActiveForSync", () => {
  it("usa el calendario del profesional si tiene uno asignado", () => {
    const map = new Map([["p1", "cal-ana"]]);
    expect(pickTargetCalendar("p1", map, "primary")).toBe("cal-ana");
    expect(pickTargetCalendar("p2", map, "primary")).toBe("primary");
    expect(pickTargetCalendar(null, map, "primary")).toBe("primary");
  });

  it("solo sincroniza citas activas", () => {
    expect(["pending", "booked", "completed"].every(isActiveForSync)).toBe(true);
    expect(["cancelled", "no_show"].some(isActiveForSync)).toBe(false);
  });
});
