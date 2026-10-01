export type PlanId = "free" | "pro" | "studio";

export type PlanDef = {
  id: PlanId;
  label: string;
  tagline: string;
  limits: {
    appointmentsPerMonth: number | null; // null = ilimitado
    locations: number | null;
    professionals: number | null;
  };
  modules: {
    publicLink: boolean;
    reminders: boolean;
    branding: boolean;
    advancedMetrics: boolean;
    aiChat: boolean;
    rolesPermissions: boolean;
    integrations: boolean;
    prioritySupport: boolean;
  };
};

export const PLANS: Record<PlanId, PlanDef> = {
  free: {
    id: "free",
    label: "Free",
    tagline: "Para empezar y probar sin compromiso.",
    limits: { appointmentsPerMonth: 50, locations: 1, professionals: 3 },
    modules: {
      publicLink: true,
      reminders: false,
      branding: false,
      advancedMetrics: false,
      aiChat: false,
      rolesPermissions: false,
      integrations: false,
      prioritySupport: false,
    },
  },
  pro: {
    id: "pro",
    label: "Pro",
    tagline: "Para salones que ya están creciendo.",
    limits: { appointmentsPerMonth: null, locations: 3, professionals: null },
    modules: {
      publicLink: true,
      reminders: true,
      branding: true,
      advancedMetrics: true,
      aiChat: false,
      rolesPermissions: false,
      integrations: false,
      prioritySupport: true,
    },
  },
  studio: {
    id: "studio",
    label: "Studio",
    tagline: "Para cadenas y equipos grandes.",
    limits: { appointmentsPerMonth: null, locations: null, professionals: null },
    modules: {
      publicLink: true,
      reminders: true,
      branding: true,
      advancedMetrics: true,
      aiChat: true,
      rolesPermissions: true,
      integrations: true,
      prioritySupport: true,
    },
  },
};

export function getPlan(plan: string | null | undefined): PlanDef {
  const id = (plan ?? "free") as PlanId;
  return PLANS[id] ?? PLANS.free;
}

export const MODULE_LABELS: Record<keyof PlanDef["modules"], string> = {
  publicLink: "Link de reservas público",
  reminders: "Recordatorios por WhatsApp y email",
  branding: "Marca y colores personalizados",
  advancedMetrics: "Métricas avanzadas",
  aiChat: "Chat con IA para clientes",
  rolesPermissions: "Roles y permisos por staff",
  integrations: "Integraciones (Google Calendar, API)",
  prioritySupport: "Soporte prioritario",
};

export function hasModule(plan: string | null | undefined, module: keyof PlanDef["modules"]): boolean {
  return getPlan(plan).modules[module];
}

/**
 * Módulos que forman parte del plan pero todavía no están construidos.
 * La UI los muestra como "Próximamente" en vez de prometerlos como activos.
 */
export const MODULES_COMING_SOON: ReadonlySet<keyof PlanDef["modules"]> = new Set([
  "reminders",
  "aiChat",
  "rolesPermissions",
  "integrations",
]);

export type PlanOverage = { limit: number; active: number; over: number };

/** ¿Cuántos recursos activos exceden el límite del plan? null si cabe (o es ilimitado). */
export function computeOverage(active: number, limit: number | null): PlanOverage | null {
  if (limit === null || active <= limit) return null;
  return { limit, active, over: active - limit };
}

export type PlanTransitionBlock = {
  locations: PlanOverage | null;
  professionals: PlanOverage | null;
};

/** Qué impide pasar a `target`: recursos activos por encima de sus límites. */
export function planTransitionBlock(
  usage: { locations: number; professionals: number },
  target: string | null | undefined,
): PlanTransitionBlock | null {
  const limits = getPlan(target).limits;
  const block = {
    locations: computeOverage(usage.locations, limits.locations),
    professionals: computeOverage(usage.professionals, limits.professionals),
  };
  return block.locations || block.professionals ? block : null;
}

export function describeTransitionBlock(b: PlanTransitionBlock, targetLabel: string): string {
  const parts: string[] = [];
  if (b.locations) parts.push(`${b.locations.over} sucursal(es) activa(s) de más (${targetLabel} permite ${b.locations.limit})`);
  if (b.professionals) parts.push(`${b.professionals.over} profesional(es) activo(s) de más (${targetLabel} permite ${b.professionals.limit})`);
  return `No puedes pasar al plan ${targetLabel} todavía: tienes ${parts.join(" y ")}. Desactiva o elimina el excedente y vuelve a intentarlo.`;
}
