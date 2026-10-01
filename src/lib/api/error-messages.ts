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
  if (msg.includes("PLAN_MODULE_BRANDING")) {
    return "La marca personalizada está disponible desde el plan Pro.";
  }
  if (msg.includes("APPT_FUTURE_CLOSE")) {
    return "No puedes completar ni marcar no-show una cita que todavía no empieza.";
  }
  if (msg.includes("APPT_REF_MISMATCH")) {
    return "La cita referencia un cliente, servicio, profesional o sucursal que no pertenece a este negocio.";
  }
  if (msg.includes("AVAILABILITY_OVERLAP")) {
    return "Los tramos de un mismo día no pueden solaparse.";
  }
  if (msg.includes("ENTITY_HAS_FUTURE_APPTS")) {
    const n = msg.match(/ENTITY_HAS_FUTURE_APPTS:(\w+):(\d+)/);
    const what =
      n?.[1] === "services"
        ? "este servicio"
        : n?.[1] === "professionals"
          ? "este profesional"
          : "esta sucursal";
    const count = n?.[2] ? ` (${n[2]})` : "";
    return `No puedes eliminar ni desactivar ${what} porque tiene citas futuras${count}. Cancélalas o reasígnalas primero.`;
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
  if (
    msg.includes("clients_unique_phone_per_business") ||
    msg.includes("clients_business_id_phone_key")
  ) {
    return "Ya existe un cliente con ese teléfono en este negocio.";
  }
  if (msg.includes("clients_phone_check")) {
    return "El teléfono no tiene un formato válido.";
  }
  return msg || "Ocurrió un error";
}
