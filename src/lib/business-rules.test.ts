import { describe, expect, it } from "vitest";
import { apptPriceCents, canChangeStatus, nextStatuses, statusOptions } from "./appointments";
import { computeOverage, describeTransitionBlock, hasModule, MODULES_COMING_SOON, planTransitionBlock } from "./plans";
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

  it("computeOverage solo reporta cuando se excede el límite", () => {
    expect(computeOverage(3, 1)).toEqual({ limit: 1, active: 3, over: 2 });
    expect(computeOverage(1, 1)).toBeNull();
    expect(computeOverage(50, null)).toBeNull();
  });

  it("no se puede bajar a Free con recursos por encima de sus límites", () => {
    const block = planTransitionBlock({ locations: 3, professionals: 2 }, "free");
    expect(block?.locations?.over).toBe(2);
    expect(block?.professionals).toBeNull();
    expect(describeTransitionBlock(block!, "Free")).toContain("2 sucursal(es)");
    expect(planTransitionBlock({ locations: 1, professionals: 3 }, "free")).toBeNull();
    expect(planTransitionBlock({ locations: 99, professionals: 99 }, "studio")).toBeNull();
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

import { BOOKING_RULES, computeSlots, isSlotOffered } from "./availability-core";
import { dayBoundsOfYmd, dayOfWeekOfYmd, ymdInTz } from "./tz";

describe("disponibilidad en la zona del negocio", () => {
  const now = new Date("2026-06-01T12:00:00Z"); // 07:00 en Lima
  const base = { date: "2026-06-02", tz: "America/Lima", durationMinutes: 60, now };

  it("genera slots a partir de la hora de pared del negocio (Lima = UTC-5)", () => {
    const slots = computeSlots({ ...base, windows: [{ start_time: "09:00", end_time: "12:00" }], busy: [] });
    expect(slots.map((s) => s.startsAt)).toEqual([
      "2026-06-02T14:00:00.000Z",
      "2026-06-02T15:00:00.000Z",
      "2026-06-02T16:00:00.000Z",
    ]);
  });

  it("descarta slots que chocan con citas existentes del mismo recurso", () => {
    const slots = computeSlots({
      ...base,
      windows: [{ start_time: "09:00", end_time: "12:00" }],
      busy: [{ starts_at: "2026-06-02T15:00:00Z", ends_at: "2026-06-02T16:00:00Z" }],
    });
    expect(slots.map((s) => s.startsAt)).toEqual(["2026-06-02T14:00:00.000Z", "2026-06-02T16:00:00.000Z"]);
  });

  it("respeta la anticipación mínima y el máximo de días", () => {
    const today = computeSlots({
      date: "2026-06-01",
      tz: "America/Lima",
      durationMinutes: 60,
      now, // 07:00 Lima: con 30 min de margen la primera hora válida es 08:00
      windows: [{ start_time: "06:00", end_time: "10:00" }],
      busy: [],
    });
    expect(today[0].startsAt).toBe("2026-06-01T13:00:00.000Z");
    const far = computeSlots({ ...base, date: "2026-12-01", windows: [{ start_time: "09:00", end_time: "10:00" }], busy: [] });
    expect(far).toEqual([]);
    expect(BOOKING_RULES.MAX_AHEAD_DAYS).toBe(90);
  });

  it("un slot reservado solo es válido si el servidor lo ofrece exactamente", () => {
    const slots = computeSlots({ ...base, windows: [{ start_time: "09:00", end_time: "11:00" }], busy: [] });
    expect(isSlotOffered(slots, new Date("2026-06-02T14:00:00Z"), new Date("2026-06-02T15:00:00Z"))).toBe(true);
    expect(isSlotOffered(slots, new Date("2026-06-02T14:30:00Z"), new Date("2026-06-02T15:30:00Z"))).toBe(false);
  });

  it("la fecha y el día de la semana salen de la zona del negocio", () => {
    // 03:00 UTC del martes 2 sigue siendo lunes 1 en Lima.
    expect(ymdInTz(new Date("2026-06-02T03:00:00Z"), "America/Lima")).toBe("2026-06-01");
    expect(dayOfWeekOfYmd("2026-06-01")).toBe(1);
    const { start, end } = dayBoundsOfYmd("2026-06-01", "America/Lima");
    expect(start.toISOString()).toBe("2026-06-01T05:00:00.000Z");
    expect(end.toISOString()).toBe("2026-06-02T05:00:00.000Z");
  });
});

import { settingsFromBusiness, DEFAULT_BOOKING_SETTINGS } from "./availability-core";

describe("reglas de reserva configurables por negocio", () => {
  const now = new Date("2026-06-01T12:00:00Z");
  const base = { date: "2026-06-02", tz: "America/Lima", durationMinutes: 60, now };
  const win = [{ start_time: "09:00", end_time: "12:00" }];

  it("sin configuración usa los valores por defecto", () => {
    expect(settingsFromBusiness(null)).toEqual(DEFAULT_BOOKING_SETTINGS);
    expect(settingsFromBusiness({ booking_buffer_minutes: 15, booking_max_no_shows: 3 })).toMatchObject({
      bufferMinutes: 15,
      maxNoShows: 3,
      minLeadMinutes: 30,
    });
  });

  it("el intervalo entre horarios puede ser menor que la duración del servicio", () => {
    const slots = computeSlots({ ...base, windows: win, busy: [], settings: { slotStepMinutes: 30 } });
    expect(slots.map((s) => s.startsAt)).toEqual([
      "2026-06-02T14:00:00.000Z",
      "2026-06-02T14:30:00.000Z",
      "2026-06-02T15:00:00.000Z",
      "2026-06-02T15:30:00.000Z",
      "2026-06-02T16:00:00.000Z",
    ]);
  });

  it("el margen entre citas bloquea horarios a ambos lados de una cita existente", () => {
    const busy = [{ starts_at: "2026-06-02T15:00:00Z", ends_at: "2026-06-02T16:00:00Z" }];
    // Sin margen: 14:00 y 16:00 quedan libres. Con 15 min: ambos chocan con el margen.
    expect(computeSlots({ ...base, windows: win, busy }).map((s) => s.startsAt)).toEqual(["2026-06-02T14:00:00.000Z", "2026-06-02T16:00:00.000Z"]);
    expect(computeSlots({ ...base, windows: win, busy, settings: { bufferMinutes: 15 } })).toEqual([]);
  });

  it("varios tramos el mismo día modelan un descanso", () => {
    const slots = computeSlots({
      ...base,
      windows: [{ start_time: "09:00", end_time: "10:00" }, { start_time: "15:00", end_time: "16:00" }],
      busy: [],
    });
    expect(slots.map((s) => s.startsAt)).toEqual(["2026-06-02T14:00:00.000Z", "2026-06-02T20:00:00.000Z"]);
  });

  it("anticipación y horizonte vienen del negocio", () => {
    const tight = computeSlots({ ...base, windows: win, busy: [], settings: { minLeadMinutes: 48 * 60 } });
    expect(tight).toEqual([]);
    const short = computeSlots({ ...base, windows: win, busy: [], settings: { maxAheadDays: 0 } });
    expect(short).toEqual([]);
  });
});
