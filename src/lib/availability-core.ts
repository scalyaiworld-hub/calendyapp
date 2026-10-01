import { dayOfWeekOfYmd, parseYmd, zonedToUtc } from "@/lib/tz";

/**
 * Reglas de reserva y cálculo de disponibilidad. Es la ÚNICA fuente de verdad:
 * lo usan el servidor para listar horarios y para validar la reserva, de modo que
 * lo que se ofrece al cliente es exactamente lo que el servidor acepta.
 * Todo se interpreta en la zona horaria del negocio, nunca en la del visitante.
 */
export type BookingSettings = {
  /** Anticipación mínima para reservar. */
  minLeadMinutes: number;
  /** Hasta cuántos días por adelantado se puede reservar. */
  maxAheadDays: number;
  /** Paso entre horarios ofrecidos; null = la duración del servicio. */
  slotStepMinutes: number | null;
  /** Margen entre citas (limpieza, traslado) a cada lado de una cita existente. */
  bufferMinutes: number;
  /** Horas mínimas de anticipación para que el cliente cancele por su cuenta. */
  cancelMinHours: number;
  /** Con N o más no-shows el cliente no puede reservar online; null = sin política. */
  maxNoShows: number | null;
};

/** Valores por defecto (los mismos que las columnas `booking_*` de la base). */
export const DEFAULT_BOOKING_SETTINGS: BookingSettings = {
  minLeadMinutes: 30,
  maxAheadDays: 90,
  slotStepMinutes: null,
  bufferMinutes: 0,
  cancelMinHours: 2,
  maxNoShows: null,
};

export const BOOKING_RULES = {
  MIN_LEAD_MINUTES: DEFAULT_BOOKING_SETTINGS.minLeadMinutes,
  MAX_AHEAD_DAYS: DEFAULT_BOOKING_SETTINGS.maxAheadDays,
} as const;

type BusinessBookingColumns = {
  booking_min_lead_minutes?: number | null;
  booking_max_ahead_days?: number | null;
  booking_slot_step_minutes?: number | null;
  booking_buffer_minutes?: number | null;
  booking_cancel_min_hours?: number | null;
  booking_max_no_shows?: number | null;
};

export function settingsFromBusiness(
  b: BusinessBookingColumns | null | undefined,
): BookingSettings {
  const d = DEFAULT_BOOKING_SETTINGS;
  return {
    minLeadMinutes: b?.booking_min_lead_minutes ?? d.minLeadMinutes,
    maxAheadDays: b?.booking_max_ahead_days ?? d.maxAheadDays,
    slotStepMinutes: b?.booking_slot_step_minutes ?? d.slotStepMinutes,
    bufferMinutes: b?.booking_buffer_minutes ?? d.bufferMinutes,
    cancelMinHours: b?.booking_cancel_min_hours ?? d.cancelMinHours,
    maxNoShows: b?.booking_max_no_shows ?? d.maxNoShows,
  };
}

export type HourWindow = { start_time: string; end_time: string };
export type BusyRange = { starts_at: string; ends_at: string };
export type SlotRange = { startsAt: string; endsAt: string };

export function timeToMinutes(t: string): number {
  const [h, m] = String(t).split(":").map(Number);
  return h * 60 + (m || 0);
}

export function computeSlots(opts: {
  /** Día calendario en la zona del negocio (YYYY-MM-DD). */
  date: string;
  tz: string;
  windows: HourWindow[];
  busy: BusyRange[];
  durationMinutes: number;
  now?: Date;
  settings?: Partial<BookingSettings>;
}): SlotRange[] {
  const { date, tz, windows, busy, durationMinutes } = opts;
  const cfg = { ...DEFAULT_BOOKING_SETTINGS, ...opts.settings };
  const now = (opts.now ?? new Date()).getTime();
  const minStart = now + cfg.minLeadMinutes * 60_000;
  const maxStart = now + cfg.maxAheadDays * 86_400_000;
  const { year, month, day } = parseYmd(date);
  const duration = durationMinutes * 60_000;
  const step = (cfg.slotStepMinutes ?? durationMinutes) * 60_000;
  const buffer = cfg.bufferMinutes * 60_000;

  // El margen se aplica a ambos lados de cada cita existente.
  const busyMs = busy.map(
    (b) =>
      [new Date(b.starts_at).getTime() - buffer, new Date(b.ends_at).getTime() + buffer] as const,
  );
  const out: SlotRange[] = [];

  for (const w of windows) {
    const wm = timeToMinutes(w.start_time);
    const em = timeToMinutes(w.end_time);
    const winStart = zonedToUtc(year, month, day, tz, Math.floor(wm / 60), wm % 60).getTime();
    const winEnd = zonedToUtc(year, month, day, tz, Math.floor(em / 60), em % 60).getTime();

    for (let t = winStart; t + duration <= winEnd; t += step) {
      if (t < minStart || t > maxStart) continue;
      const end = t + duration;
      if (busyMs.some(([bs, be]) => t < be && end > bs)) continue;
      out.push({ startsAt: new Date(t).toISOString(), endsAt: new Date(end).toISOString() });
    }
  }
  return out.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/** ¿Esta hora de inicio exacta forma parte de los horarios disponibles? */
export function isSlotOffered(slots: SlotRange[], startsAt: Date, endsAt: Date): boolean {
  return slots.some(
    (s) =>
      new Date(s.startsAt).getTime() === startsAt.getTime() &&
      new Date(s.endsAt).getTime() === endsAt.getTime(),
  );
}

export { dayOfWeekOfYmd };
