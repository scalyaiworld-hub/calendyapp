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
    exports: boolean;
    prioritySupport: boolean;
  };
};

export type ModuleKey = keyof PlanDef["modules"];

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
      exports: false,
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
      exports: false,
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
      exports: true,
      prioritySupport: true,
    },
  },
};

export const PLAN_ORDER: PlanId[] = ["free", "pro", "studio"];

export function getPlan(plan: string | null | undefined): PlanDef {
  const id = (plan ?? "free") as PlanId;
  return PLANS[id] ?? PLANS.free;
}

export function hasModule(plan: string | null | undefined, module: ModuleKey): boolean {
  return getPlan(plan).modules[module];
}

/** Plan más barato que incluye el módulo (para el CTA de upgrade). */
export function minPlanForModule(module: ModuleKey): PlanDef {
  const id = PLAN_ORDER.find((p) => PLANS[p].modules[module]);
  return PLANS[id ?? "studio"];
}

export const MODULE_LABELS: Record<ModuleKey, string> = {
  publicLink: "Link de reservas público",
  reminders: "Recordatorios por WhatsApp y email",
  branding: "Marca y colores personalizados",
  advancedMetrics: "Métricas avanzadas",
  aiChat: "Chat con IA para clientes",
  rolesPermissions: "Roles y permisos por staff",
  integrations: "Integraciones (Google Calendar, API)",
  exports: "Reportes y exportes avanzados",
  prioritySupport: "Soporte prioritario",
};