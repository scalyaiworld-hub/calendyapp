import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  generateApiKey,
  looksLikeApiKey,
  sha256Hex,
  signWebhook,
  validateWebhookUrl,
  webhookBackoffMs,
} from "./integrations";
import { buildIcs, icsDate, icsEscape, icsFold } from "./ics";

describe("claves de API", () => {
  it("genera claves únicas con prefijo, y el hash coincide con SHA-256", async () => {
    const a = await generateApiKey();
    const b = await generateApiKey();
    expect(a.key).not.toBe(b.key);
    expect(a.key.startsWith("cal_live_")).toBe(true);
    expect(a.key.startsWith(a.prefix)).toBe(true);
    expect(a.prefix.length).toBeLessThan(a.key.length / 2); // el prefijo no revela la clave
    expect(a.hash).toBe(await sha256Hex(a.key));
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(looksLikeApiKey(a.key)).toBe(true);
  });
  it("rechaza valores que no parecen claves", () => {
    for (const v of ["", "abc", "cal_live_", "Bearer x", "cal_live_" + "a".repeat(200)])
      expect(looksLikeApiKey(v)).toBe(false);
  });
});

describe("firma de webhooks", () => {
  it("coincide con HMAC-SHA256 de timestamp.cuerpo", async () => {
    const expected = createHmac("sha256", "whsec_test").update('1700000000.{"a":1}').digest("hex");
    expect(await signWebhook("whsec_test", 1700000000, '{"a":1}')).toBe(expected);
  });
  it("cambia si cambia el cuerpo, el secreto o la hora", async () => {
    const base = await signWebhook("s", 1, "x");
    expect(await signWebhook("s", 1, "y")).not.toBe(base);
    expect(await signWebhook("t", 1, "x")).not.toBe(base);
    expect(await signWebhook("s", 2, "x")).not.toBe(base);
  });
});

describe("validateWebhookUrl", () => {
  it("acepta https con dominio público", () => {
    expect(validateWebhookUrl("https://hooks.zapier.com/hooks/catch/1/abc/")).toMatchObject({
      ok: true,
    });
    expect(validateWebhookUrl("  https://example.com:443/x?y=1 ")).toMatchObject({ ok: true });
  });
  it("rechaza http, credenciales y puertos distintos de 443", () => {
    for (const u of [
      "http://example.com/h",
      "https://user:pw@example.com/h",
      "https://example.com:8443/h",
      "ftp://example.com",
      "no es url",
      "",
    ]) {
      expect(validateWebhookUrl(u).ok).toBe(false);
    }
  });
  it("rechaza IPs (incluidas formas numéricas), localhost y dominios internos", () => {
    for (const u of [
      "https://127.0.0.1/h",
      "https://10.0.0.5/h",
      "https://169.254.169.254/latest/meta-data",
      "https://[::1]/h",
      "https://2130706433/h",
      "https://0x7f.1/h",
      "https://localhost/h",
      "https://app.localhost/h",
      "https://db.internal/h",
      "https://printer.local/h",
      "https://intranet/h",
      "https://router.home.arpa/h",
    ]) {
      expect(validateWebhookUrl(u).ok, u).toBe(false);
    }
  });
  it("rechaza URLs de más de 500 caracteres", () => {
    expect(validateWebhookUrl("https://example.com/" + "a".repeat(600)).ok).toBe(false);
  });
});

describe("webhookBackoffMs", () => {
  it("crece y se queda en 6 h", () => {
    expect([1, 2, 3, 4, 5, 9].map((n) => webhookBackoffMs(n) / 60_000)).toEqual([
      1, 5, 30, 120, 360, 360,
    ]);
  });
});

describe("ICS", () => {
  it("escapa caracteres especiales y saltos de línea", () => {
    expect(icsEscape("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
  });
  it("formatea fechas UTC", () => {
    expect(icsDate(new Date("2026-10-02T15:00:00.000Z"))).toBe("20261002T150000Z");
  });
  it("dobla líneas largas a 75 octetos sin partir caracteres", () => {
    const lines = icsFold("SUMMARY:" + "ñ".repeat(100));
    for (const l of lines) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
    expect(lines.slice(1).every((l) => l.startsWith(" "))).toBe(true);
    expect(lines.map((l, i) => (i ? l.slice(1) : l)).join("")).toBe("SUMMARY:" + "ñ".repeat(100));
  });
  it("arma un calendario válido con CRLF", () => {
    const ics = buildIcs({
      name: "Salón, Centro",
      now: new Date("2026-10-01T00:00:00Z"),
      events: [
        {
          id: "abc",
          startsAt: new Date("2026-10-02T15:00:00Z"),
          endsAt: new Date("2026-10-02T15:30:00Z"),
          summary: "Corte — Ana",
          description: "Tel: +51 9",
          status: "CONFIRMED",
        },
      ],
    });
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("X-WR-CALNAME:Salón\\, Centro");
    expect(ics).toContain("UID:abc@calendya");
    expect(ics).toContain("DTSTART:20261002T150000Z");
    expect(ics.replace(/\r\n/g, "").includes("\n")).toBe(false);
  });
});
