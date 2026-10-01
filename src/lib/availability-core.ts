import { dayOfWeekOfYmd, parseYmd, zonedToUtc } from "@/lib/tz";

/**
 * Reglas de reserva y cálculo de disponibilidad. Es la ÚNICA fuente de verdad:
 * lo usan el servidor para listar horarios y para validar la reserva, de modo que
 * lo que se ofrece al cliente es exactamente lo que el servidor acepta.
 * Todo se interpreta en la zona horaria del negocio, nunca en la del visitante.
 */
export const BOOKING_RULES = {
  MIN_LEAD_MINUTES: 30,
  MAX_AHEAD_DAYS: 90,
} as const;

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
}): SlotRange[] {
  const { date, tz, windows, busy, durationMinutes } = opts;
  const now = (opts.now ?? new Date()).getTime();
  const minStart = now + BOOKING_RULES.MIN_LEAD_MINUTES * 60_000;
  const maxStart = now + BOOKING_RULES.MAX_AHEAD_DAYS * 86_400_000;
  const { year, month, day } = parseYmd(date);
  const step = durationMinutes * 60_000;

  const busyMs = busy.map((b) => [new Date(b.starts_at).getTime(), new Date(b.ends_at).getTime()] as const);
  const out: SlotRange[] = [];

  for (const w of windows) {
    const wm = timeToMinutes(w.start_time);
    const em = timeToMinutes(w.end_time);
    const winStart = zonedToUtc(year, month, day, tz, Math.floor(wm / 60), wm % 60).getTime();
    const winEnd = zonedToUtc(year, month, day, tz, Math.floor(em / 60), em % 60).getTime();

    for (let t = winStart; t + step <= winEnd; t += step) {
      if (t < minStart || t > maxStart) continue;
      const end = t + step;
      if (busyMs.some(([bs, be]) => t < be && end > bs)) continue;
      out.push({ startsAt: new Date(t).toISOString(), endsAt: new Date(end).toISOString() });
    }
  }
  return out.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/** ¿Esta hora de inicio exacta forma parte de los horarios disponibles? */
export function isSlotOffered(slots: SlotRange[], startsAt: Date, endsAt: Date): boolean {
  return slots.some((s) => new Date(s.startsAt).getTime() === startsAt.getTime() && new Date(s.endsAt).getTime() === endsAt.getTime());
}

export { dayOfWeekOfYmd };
