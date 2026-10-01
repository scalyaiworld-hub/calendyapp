import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { deliverToEndpoint } from "./webhooks.server";

const endpoint = { url: "https://hooks.example.com/in", secret: "whsec_test" };
const delivery = { id: "d1", eventId: "e1", event: "appointment.created", createdAt: "2026-10-01T00:00:00Z", payload: { event: "appointment.created", appointment: { id: "a1" } } };

const okResponse = (status = 200) => ({ status, body: { cancel: () => Promise.resolve() } }) as unknown as Response;

describe("deliverToEndpoint", () => {
  it("envía un POST firmado que el receptor puede verificar", async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse());
    const res = await deliverToEndpoint(endpoint, delivery, fetchFn as unknown as typeof fetch);
    expect(res).toEqual({ ok: true, status: 200, error: null });

    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe("https://hooks.example.com/in");
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("manual");
    expect(init.headers["X-Calendya-Event"]).toBe("appointment.created");
    expect(init.headers["X-Calendya-Delivery"]).toBe("d1");

    const ts = init.headers["X-Calendya-Timestamp"];
    const expected = createHmac("sha256", "whsec_test").update(`${ts}.${init.body as string}`).digest("hex");
    expect(init.headers["X-Calendya-Signature"]).toBe(`sha256=${expected}`);
    expect(JSON.parse(init.body as string)).toMatchObject({ id: "e1", event: "appointment.created", appointment: { id: "a1" } });
  });

  it("trata 4xx/5xx como fallo y no sigue redirecciones", async () => {
    expect(await deliverToEndpoint(endpoint, delivery, vi.fn().mockResolvedValue(okResponse(500)) as unknown as typeof fetch)).toMatchObject({ ok: false, status: 500, error: "HTTP 500" });
    const redirect = await deliverToEndpoint(endpoint, delivery, vi.fn().mockResolvedValue(okResponse(302)) as unknown as typeof fetch);
    expect(redirect).toMatchObject({ ok: false, status: 302 });
    expect(redirect.error).toContain("no se siguen");
  });

  it("informa tiempo de espera y errores de red sin filtrar detalles internos", async () => {
    const timeout = Object.assign(new Error("x"), { name: "TimeoutError" });
    expect(await deliverToEndpoint(endpoint, delivery, vi.fn().mockRejectedValue(timeout) as unknown as typeof fetch)).toMatchObject({ ok: false, error: "Tiempo de espera agotado" });
    const net = await deliverToEndpoint(endpoint, delivery, vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.5:443")) as unknown as typeof fetch);
    expect(net.error).toBe("No se pudo conectar");
  });

  it("revalida la URL en cada envío y no llama a fetch si es interna", async () => {
    const fetchFn = vi.fn();
    const res = await deliverToEndpoint({ url: "https://169.254.169.254/latest", secret: "s" }, delivery, fetchFn as unknown as typeof fetch);
    expect(res.ok).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
