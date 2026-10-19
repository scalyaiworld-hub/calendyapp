/**
 * Valores por defecto que crea el onboarding para que el negocio pueda compartir su link
 * de reservas desde el primer minuto (hace falta al menos una sucursal, un profesional y un servicio).
 * El dueño los edita después desde el panel.
 */
export const DEFAULT_LOCATION_NAME = "Sede principal";

/** Nombre del primer profesional: el del dueño si lo conocemos (p. ej. por Google); si no, el del negocio. */
export function defaultProfessionalName(
  fullName: string | null | undefined,
  businessName: string,
): string {
  const owner = (fullName ?? "").trim();
  const name = owner || businessName.trim();
  return (name || "Profesional").slice(0, 100);
}
