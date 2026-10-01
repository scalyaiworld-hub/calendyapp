export type ApptStatus = "pending" | "booked" | "completed" | "cancelled" | "no_show";

export const STATUS_LABELS: Record<ApptStatus, string> = {
  pending: "Pendiente",
  booked: "Confirmada",
  completed: "Completada",
  cancelled: "Cancelada",
  no_show: "No-show",
};

const TERMINAL: ApptStatus[] = ["completed", "cancelled", "no_show"];

export function isTerminalStatus(status: string): boolean {
  return (TERMINAL as string[]).includes(status);
}

/**
 * Estados a los que puede pasar una cita desde su estado actual.
 * Espejo de `validate_appointment_update()` en la base:
 *   pending -> booked | cancelled | (completed | no_show si ya empezó)
 *   booked  -> cancelled | (completed | no_show si ya empezó)
 *   completed / cancelled / no_show son terminales.
 * Marcar completed o no_show antes de la hora de inicio no tiene sentido y
 * distorsiona ingresos y contadores de no-show.
 */
export function nextStatuses(
  current: string,
  startsAt: string | Date,
  now: Date = new Date(),
): ApptStatus[] {
  if (isTerminalStatus(current)) return [];
  const started = new Date(startsAt).getTime() <= now.getTime();
  const next: ApptStatus[] = [];
  if (current === "pending") next.push("booked");
  next.push("cancelled");
  if (started) next.push("completed", "no_show");
  return next;
}

/** Opciones para un <Select>: el estado actual (para mostrarlo) más los destinos válidos. */
export function statusOptions(
  current: string,
  startsAt: string | Date,
  now: Date = new Date(),
): ApptStatus[] {
  const cur = current as ApptStatus;
  return [cur, ...nextStatuses(current, startsAt, now)];
}

export function canChangeStatus(
  current: string,
  target: string,
  startsAt: string | Date,
  now: Date = new Date(),
): boolean {
  return nextStatuses(current, startsAt, now).includes(target as ApptStatus);
}

/** Precio efectivo de una cita: el congelado al crearla; para filas antiguas, el del servicio. */
export function apptPriceCents(a: {
  price_cents?: number | null;
  services?: { price_cents?: number | null } | null;
}): number {
  return a.price_cents ?? a.services?.price_cents ?? 0;
}
