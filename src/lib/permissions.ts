// Permisos por rol para el panel. La seguridad real vive en RLS (ver 20261001170000_team_roles.sql);
// esto solo decide qué ve cada rol en el menú y a qué pantallas puede entrar.

export type Role = "owner" | "manager" | "reception" | "professional";
export type AssignableRole = Exclude<Role, "owner">;

export const ASSIGNABLE_ROLES: AssignableRole[] = ["manager", "reception", "professional"];

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Dueño",
  manager: "Administrador",
  reception: "Recepción",
  professional: "Profesional",
};

export const ROLE_DESCRIPTIONS: Record<AssignableRole, string> = {
  manager: "Gestiona agenda, clientes, catálogo y métricas. No cambia ajustes, plan ni equipo.",
  reception: "Gestiona agenda, citas y clientes. Ve el catálogo pero no lo edita.",
  professional: "Ve y atiende solo sus propias citas y los clientes de esas citas.",
};

const ALL: Role[] = ["owner", "manager", "reception", "professional"];
const FRONT_DESK: Role[] = ["owner", "manager", "reception"];
const MANAGERS: Role[] = ["owner", "manager"];
const OWNER_ONLY: Role[] = ["owner"];

/** Ruta -> roles permitidos. Cualquier /dashboard/* que no figure aquí es solo del dueño (denegar por defecto). */
const ACCESS: Record<string, Role[]> = {
  "/dashboard": ALL,
  "/dashboard/agenda": ALL,
  "/dashboard/citas": ALL,
  "/dashboard/clientes": FRONT_DESK,
  "/dashboard/metricas": MANAGERS,
  "/dashboard/servicios": MANAGERS,
  "/dashboard/profesionales": MANAGERS,
  "/dashboard/sucursales": MANAGERS,
  "/dashboard/horarios": MANAGERS,
  "/dashboard/equipo": OWNER_ONLY,
  "/dashboard/planes": OWNER_ONLY,
  "/dashboard/ajustes": OWNER_ONLY,
};

export function canAccessPath(role: Role | null | undefined, pathname: string): boolean {
  if (!role) return false;
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  // Ruta exacta, o por prefijo para sus subrutas. "/dashboard" es solo exacta: si no, abriría
  // cualquier pantalla futura a todos los roles en vez de denegarla por defecto.
  const key = Object.keys(ACCESS)
    .filter((k) => path === k || (k !== "/dashboard" && path.startsWith(k + "/")))
    .sort((a, b) => b.length - a.length)[0];
  return (key ? ACCESS[key] : OWNER_ONLY).includes(role);
}
