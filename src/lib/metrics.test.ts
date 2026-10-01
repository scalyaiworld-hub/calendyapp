import { describe, expect, it } from "vitest";
import { computeMetrics, localParts, type MetricAppt } from "./metrics";
import { csvCell, toCsv } from "./csv";

const services = new Map([
  ["s1", { name: "Corte", price_cents: 5000 }],
  ["s2", { name: "Tinte", price_cents: 12000 }],
]);
const professionals = new Map([["p1", { name: "Ana" }]]);
const base = { source: "booking_page", professional_id: "p1" };
const a = (o: Partial<MetricAppt> & Pick<MetricAppt, "starts_at" | "status" | "service_id" | "client_id">): MetricAppt => ({ ...base, ...o });

describe("computeMetrics", () => {
  const appts: MetricAppt[] = [
    a({ starts_at: "2026-09-28T15:00:00Z", status: "completed", service_id: "s1", client_id: "c1" }), // lun 10:00 Lima
    a({ starts_at: "2026-09-29T15:00:00Z", status: "completed", service_id: "s2", client_id: "c1" }),
    a({ starts_at: "2026-09-29T16:00:00Z", status: "no_show", service_id: "s1", client_id: "c2" }),
    a({ starts_at: "2026-09-30T15:00:00Z", status: "cancelled", service_id: "s1", client_id: "c3" }),
    a({ starts_at: "2026-10-02T15:00:00Z", status: "booked", service_id: "s1", client_id: "c4", professional_id: null }),
  ];
  const m = computeMetrics(appts, {
    services,
    professionals,
    timezone: "America/Lima",
    from: new Date("2026-09-28T05:00:00Z"),
    to: new Date("2026-10-02T20:00:00Z"),
  });

  it("cuenta por estado y calcula tasas", () => {
    expect(m.totals).toEqual({ total: 5, completed: 2, cancelled: 1, noShow: 1, upcoming: 1 });
    expect(m.cancellationRate).toBeCloseTo(1 / 5);
    expect(m.noShowRate).toBeCloseTo(1 / 3);
  });
  it("el ingreso solo suma completadas y excluye canceladas y no-show", () => {
    expect(m.revenueCents).toBe(17000);
    expect(m.avgTicketCents).toBe(8500);
  });
  it("cuenta clientes únicos y recurrentes sin canceladas", () => {
    expect(m.uniqueClients).toBe(3);
    expect(m.recurringClients).toBe(1);
  });
  it("agrupa por servicio, profesional y hora local", () => {
    expect(m.byService[0]).toMatchObject({ id: "s1", count: 3 });
    expect(m.byProfessional).toEqual([{ id: "p1", name: "Ana", count: 3, revenueCents: 17000 }]);
    expect(m.byHour[10]).toBe(3);
    expect(m.byHour[11]).toBe(1);
    expect(m.byWeekday[1]).toBe(1);
  });
  it("la serie diaria es continua e incluye días sin citas", () => {
    expect(m.byDay.map((d) => d.date)).toEqual(["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"]);
    expect(m.byDay.find((d) => d.date === "2026-10-01")?.count).toBe(0);
  });
  it("sin citas no divide entre cero", () => {
    const e = computeMetrics([], { services, professionals, timezone: "America/Lima", from: new Date(), to: new Date() });
    expect(e.cancellationRate).toBe(0);
    expect(e.noShowRate).toBe(0);
    expect(e.avgTicketCents).toBe(0);
  });
});

describe("localParts", () => {
  it("usa la zona del negocio y tolera una inválida", () => {
    expect(localParts(new Date("2026-10-02T03:00:00Z"), "America/Lima").ymd).toBe("2026-10-01");
    expect(() => localParts(new Date(), "No/Existe")).not.toThrow();
  });
});

describe("csv", () => {
  it("escapa comillas, comas y saltos de línea", () => {
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell("x\ny")).toBe('"x\ny"');
    expect(csvCell(null)).toBe("");
  });
  it("neutraliza fórmulas (CSV injection)", () => {
    expect(csvCell("+51999")).toBe("'+51999");
    expect(csvCell("@cmd")).toBe("'@cmd");
    expect(csvCell("=1+1")).toBe("'=1+1");
  });
  it("arma filas con BOM y CRLF", () => {
    expect(toCsv(["a", "b"], [[1, "x"]])).toBe("﻿a,b\r\n1,x\r\n");
  });
});
