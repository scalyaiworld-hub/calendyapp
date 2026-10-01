import { describe, expect, it } from "vitest";
import { buildReminderEmail, escapeHtml, isDue, isValidEmail, shouldAttempt } from "./reminders";

const now = new Date("2026-10-01T12:00:00Z");
const inHours = (h: number) => new Date(now.getTime() + h * 3600_000);

describe("isDue", () => {
  it("avisa dentro de la ventana y no antes ni demasiado tarde", () => {
    expect(isDue(inHours(24), now, 24)).toBe(true);
    expect(isDue(inHours(25), now, 24)).toBe(false);
    expect(isDue(inHours(0.5), now, 24)).toBe(false);
    expect(isDue(inHours(-1), now, 24)).toBe(false);
  });
});

describe("shouldAttempt", () => {
  const at = (minAgo: number) => new Date(now.getTime() - minAgo * 60_000).toISOString();
  it("envía si no hay registro", () => expect(shouldAttempt(undefined, now)).toBe("new"));
  it("no repite enviados ni agotados", () => {
    expect(shouldAttempt({ status: "sent", attempts: 1, updated_at: at(1) }, now)).toBe("skip");
    expect(shouldAttempt({ status: "failed", attempts: 3, updated_at: at(1) }, now)).toBe("skip");
  });
  it("reintenta fallidos y 'sending' caídos, pero no los recientes", () => {
    expect(shouldAttempt({ status: "failed", attempts: 1, updated_at: at(1) }, now)).toBe("retry");
    expect(shouldAttempt({ status: "sending", attempts: 1, updated_at: at(20) }, now)).toBe(
      "retry",
    );
    expect(shouldAttempt({ status: "sending", attempts: 1, updated_at: at(2) }, now)).toBe("skip");
  });
});

describe("isValidEmail", () => {
  it("valida formato básico", () => {
    expect(isValidEmail("a@b.co")).toBe(true);
    expect(isValidEmail("sin-arroba")).toBe(false);
    expect(isValidEmail(null)).toBe(false);
  });
});

describe("buildReminderEmail", () => {
  const base = {
    businessName: "Salón <b>X</b>",
    clientName: 'Ana "A"',
    serviceName: "Corte",
    startsAt: new Date("2026-10-02T15:00:00Z"),
    timezone: "America/Lima",
  };
  it("escapa HTML en el cuerpo y usa la zona horaria del negocio", () => {
    const m = buildReminderEmail(base);
    expect(m.html).not.toContain("<b>X</b>");
    expect(m.html).toContain("Salón &lt;b&gt;X&lt;/b&gt;");
    expect(m.text).toContain("10:00"); // 15:00Z = 10:00 en Lima
  });
  it("no revienta con una zona horaria inválida", () => {
    expect(() => buildReminderEmail({ ...base, timezone: "No/Existe" })).not.toThrow();
  });
  it("escapeHtml cubre comillas y &", () =>
    expect(escapeHtml(`&"'<`)).toBe("&amp;&quot;&#39;&lt;"));
});
