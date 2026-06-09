import type { QueryClient } from "@tanstack/react-query";

/**
 * Llaves de cache compartidas entre módulos (agenda, citas, clientes, dashboard).
 * Cualquier mutación que afecte una de estas entidades debe invalidar el grupo correcto
 * para mantener todas las vistas sincronizadas.
 */
export const APPT_RELATED_KEYS = [
  ["appts"],
  ["today-appts"],
  ["citas"],
  ["counts"],
  ["month-appts-count"],
] as const;

export const CLIENT_RELATED_KEYS = [
  ["clients"],
  ["clients-min"],
  ["citas-clients"],
  ["counts"],
] as const;

/** Invalida todo lo relacionado a citas (incluye dashboard y clientes-min porque
 * crear una cita puede crear un cliente nuevo). */
export function invalidateAppointments(qc: QueryClient) {
  for (const key of APPT_RELATED_KEYS) qc.invalidateQueries({ queryKey: key });
  for (const key of CLIENT_RELATED_KEYS) qc.invalidateQueries({ queryKey: key });
}

/** Invalida todo lo relacionado a clientes (y refresca citas porque muestran
 * nombre/teléfono del cliente). */
export function invalidateClients(qc: QueryClient) {
  for (const key of CLIENT_RELATED_KEYS) qc.invalidateQueries({ queryKey: key });
  for (const key of APPT_RELATED_KEYS) qc.invalidateQueries({ queryKey: key });
}