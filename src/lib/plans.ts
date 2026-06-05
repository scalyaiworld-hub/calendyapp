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