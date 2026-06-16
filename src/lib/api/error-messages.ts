/**
 * Traduce los códigos de error que lanzan los triggers de la base
 * a mensajes claros para el usuario final.
 */
export function translateDbError(err: unknown): string {
  const msg = (err as { message?: string })?.message ?? String(err ?? "");

  if (msg.includes("PLAN_LIMIT_APPOINTMENTS")) {
    return "Alcanzaste el límite de citas de tu plan este mes. Actualiza tu plan para seguir creando.";
  }
  if (msg.includes("PLAN_LIMIT_LOCATIONS")) {
    return "Tu plan no permite más sucursales. Actualiza tu plan para añadir otra.";
  }
  if (msg.includes("PLAN_LIMIT_PROFESSIONALS")) {
    return "Tu plan no permite más profesionales. Actualiza tu plan para añadir otro.";
  }
  if (msg.includes("APPT_STATUS_TERMINAL")) {
    return "Esta cita ya está cerrada (completada, cancelada o no-show) y no se puede reabrir.";
  }
  if (msg.includes("APPT_STATUS_INVALID")) {
    return "Cambio de estado no permitido para esta cita.";
  }
  if (msg.includes("APPT_PAST_LOCKED")) {
    return "No puedes cambiar la fecha o la hora de una cita que ya pasó.";
  }
  if (msg.includes("appts_no_overlap")) {
    return "Ese horario ya fue tomado por otra cita. Elige otro.";
  }
  if (msg.includes("clients_unique_phone_per_business") || msg.includes("clients_business_id_phone_key")) {
    return "Ya existe un cliente con ese teléfono en este negocio.";
  }
  if (msg.includes("clients_phone_check")) {
    return "El teléfono no tiene un formato válido.";
  }
  return msg || "Ocurrió un error";
}