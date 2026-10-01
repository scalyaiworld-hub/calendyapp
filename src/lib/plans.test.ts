import { describe, expect, it } from "vitest";
import { getPlan, hasModule, minPlanForModule, PLANS, type ModuleKey } from "./plans";

describe("hasModule", () => {
  it("trata planes nulos o desconocidos como free", () => {
    expect(hasModule(null, "reminders")).toBe(false);
    expect(hasModule("enterprise", "reminders")).toBe(false);
    expect(getPlan("enterprise").id).toBe("free");
  });

  it("respeta la matriz de módulos por plan", () => {
    expect(hasModule("free", "publicLink")).toBe(true);
    expect(hasModule("pro", "reminders")).toBe(true);
    expect(hasModule("pro", "aiChat")).toBe(false);
    expect(hasModule("studio", "aiChat")).toBe(true);
  });
});

describe("minPlanForModule", () => {
  it("devuelve el plan más barato que incluye el módulo", () => {
    expect(minPlanForModule("publicLink").id).toBe("free");
    expect(minPlanForModule("reminders").id).toBe("pro");
    expect(minPlanForModule("rolesPermissions").id).toBe("studio");
  });

  it("los planes superiores incluyen todo lo del inferior", () => {
    for (const k of Object.keys(PLANS.free.modules) as ModuleKey[]) {
      if (PLANS.free.modules[k]) expect(PLANS.pro.modules[k]).toBe(true);
      if (PLANS.pro.modules[k]) expect(PLANS.studio.modules[k]).toBe(true);
    }
  });
});
