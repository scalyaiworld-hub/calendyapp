import { describe, expect, it } from "vitest";
import { apptPriceCents, canChangeStatus, nextStatuses, statusOptions } from "./appointments";
import { computeExcess, getPlan, hasModule, MODULES_COMING_SOON, PLANS } from "./plans";
import { dayBoundsInTz, monthBoundsInTz, zonedToUtc } from "./tz";
import { timeToMinutes, windowsFit } from "./manual-booking";

const past = "2020-01-01T10:00:00Z";
const future = "2999-01-01T10:00:00Z";

describe("transiciones de estado de citas", () => {
  it("pending/booked pueden cancelarse; pending además confirmarse", () => {
    expect(nextStatuses("pending", future)).toEqual(["booked", "cancelled"]);
    expect(nextStatuses("booked", future)).toEqual(["cancelled"]);
  });

  it("solo se completa o marca no-show una cita que ya empezó", () => {
    expect(nextStatuses("booked", past)).toEqual(["cancelled", "completed", "no_show"]);
    expect(canChangeStatus("booked", "completed", future)).toBe(false);
    expect(canChangeStatus("booked", "completed", past)).toBe(true);
    expect(canChangeStatus("pending", "no_show", future)).toBe(false);
  });

  it("los estados terminales no tienen destinos", () => {
    for (const s of ["completed", "cancelled", "no_show"]) {
      expect(nextStatuses(s, past)).toEqual([]);
      expect(statusOptions(s, past)).toEqual([s]);
    }
  });

  it("el precio congelado en la cita gana sobre el del servicio", () => {
    expect(apptPriceCents({ price_cents: 5000, services: { price_cents: 8000 } })).toBe(5000);
    expect(apptPriceCents({ price_cents: null, services: { price_cents: 8000 } })).toBe(8000);
    expect(apptPriceCents({})).toBe(0);
  });
});

describe("módulos y límites de plan", () => {
  it("la marca personalizada solo está en Pro y Studio", () => {
    expect(hasModule("free", "branding")).toBe(false);
    expect(hasModule("pro", "branding")).toBe(true);
    expect(hasModule("studio", "branding")).toBe(true);
    expect(hasModule(null, "branding")).toBe(false);
  });

  it("los módulos no construidos se marcan como próximamente", () => {
    expect(MODULES_COMING_SOON.has("reminders")).toBe(true);
    expect(MODULES_COMING_SOON.has("branding")).toBe(false);
  });

  it("computeExcess conserva los más antiguos y desactiva los recientes", () => {
    const items = [
      { id: "c", created_at: "2026-03-01" },
      { id: "a", created_at: "2026-01-01" },
      { id: "b", created_at: "2026-02-01" },
    ];
    expect(computeExcess(items, 1)).toEqual({ limit: 1, active: 3, deactivateIds: ["b", "c"] });
    expect(computeExcess(items, 3)).toBeNull();
    expect(computeExcess(items, null)).toBeNull();
  });

  it("bajar de Studio a Free deja excedente según los límites de Free", () => {
    const limits = getPlan("free").limits;
    expect(limits.locations).toBe(PLANS.free.limits.locations);
    const locs = Array.from({ length: 3 }, (_, i) => ({ id: `l${i}`, created_at: `2026-0${i + 1}-01` }));
    expect(computeExcess(locs, limits.locations)?.deactivateIds).toEqual(["l1", "l2"]);
  });
});

describe("zona horaria", () => {
  it("el mes se calcula en la zona del negocio, no en UTC", () => {
    // 2026-03-01 02:00 UTC sigue siendo febrero en Lima (UTC-5).
    const { start, end } = monthBoundsInTz(new Date("2026-03-01T02:00:00Z"), "America/Lima");
    expect(start.toISOString()).toBe("2026-02-01T05:00:00.000Z");
    expect(end.toISOString()).toBe("2026-03-01T05:00:00.000Z");
  });

  it("maneja el cambio de año", () => {
    const { start, end } = monthBoundsInTz(new Date("2026-12-15T12:00:00Z"), "America/Lima");
    expect(start.toISOString()).toBe("2026-12-01T05:00:00.000Z");
    expect(end.toISOString()).toBe("2027-01-01T05:00:00.000Z");
  });

  it("respeta DST (Nueva York)", () => {
    expect(zonedToUtc(2026, 1, 1, "America/New_York").toISOString()).toBe("2026-01-01T05:00:00.000Z");
    expect(zonedToUtc(2026, 7, 1, "America/New_York").toISOString()).toBe("2026-07-01T04:00:00.000Z");
    const { start, end } = dayBoundsInTz(new Date("2026-03-08T12:00:00Z"), "America/New_York");
    expect((end.getTime() - start.getTime()) / 3_600_000).toBe(23);
  });
});

describe("horario de atención", () => {
  const windows = [{ start_time: "09:00:00", end_time: "13:00:00" }, { start_time: "15:00", end_time: "19:00" }];
  it("convierte horas a minutos", () => {
    expect(timeToMinutes("09:30:00")).toBe(570);
  });
  it("exige que la cita quepa completa en una ventana", () => {
    expect(windowsFit(9 * 60, 10 * 60, windows)).toBe(true);
    expect(windowsFit(12 * 60 + 30, 13 * 60 + 30, windows)).toBe(false);
    expect(windowsFit(13 * 60, 15 * 60, windows)).toBe(false);
    expect(windowsFit(18 * 60, 19 * 60, windows)).toBe(true);
  });
});
