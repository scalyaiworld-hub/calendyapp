/** Utilidades de zona horaria sin dependencias externas (Intl). */

type Parts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function partsInTz(date: Date, tz: string): Parts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const out: Record<string, number> = {};
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  return {
    year: out.year,
    month: out.month,
    day: out.day,
    hour: out.hour === 24 ? 0 : out.hour,
    minute: out.minute,
    second: out.second,
  };
}

/** Diferencia (ms) entre la hora de pared en `tz` y UTC para el instante dado. */
export function tzOffsetMs(date: Date, tz: string): number {
  const p = partsInTz(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Instante UTC correspondiente a una hora de pared en `tz` (month es 1-12). */
export function zonedToUtc(year: number, month: number, day: number, tz: string, hour = 0, minute = 0): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  let ts = guess - tzOffsetMs(new Date(guess), tz);
  // Segunda pasada: corrige cuando el offset cambia entre la estimación y el instante real (DST).
  ts = guess - tzOffsetMs(new Date(ts), tz);
  return new Date(ts);
}

/** Inicio (inclusive) y fin (exclusivo) del mes calendario de `ref` en la zona `tz`. */
export function monthBoundsInTz(ref: Date, tz: string): { start: Date; end: Date } {
  const p = partsInTz(ref, tz);
  const nextYear = p.month === 12 ? p.year + 1 : p.year;
  const nextMonth = p.month === 12 ? 1 : p.month + 1;
  return {
    start: zonedToUtc(p.year, p.month, 1, tz),
    end: zonedToUtc(nextYear, nextMonth, 1, tz),
  };
}

/** Inicio (inclusive) y fin (exclusivo) del día calendario de `ref` en `tz`. */
export function dayBoundsInTz(ref: Date, tz: string): { start: Date; end: Date } {
  const p = partsInTz(ref, tz);
  const start = zonedToUtc(p.year, p.month, p.day, tz);
  // Se calcula desde el día siguiente (no start + 24h) para respetar días de 23/25 h.
  const next = new Date(Date.UTC(p.year, p.month - 1, p.day + 1));
  const end = zonedToUtc(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), tz);
  return { start, end };
}
