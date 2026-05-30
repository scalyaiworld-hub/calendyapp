export function formatPriceCents(cents: number): string {
  const soles = cents / 100;
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    maximumFractionDigits: 0,
  }).format(soles);
}

export function formatTime(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function formatDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" });
}

export function formatShortDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
}

export const DAY_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
export const DAY_NAMES_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}