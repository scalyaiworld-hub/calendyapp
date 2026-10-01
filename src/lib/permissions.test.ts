import { describe, expect, it } from "vitest";
import { canAccessPath } from "./permissions";

describe("canAccessPath", () => {
  it("el dueño entra a todo, incluidas rutas desconocidas", () => {
    for (const p of ["/dashboard", "/dashboard/planes", "/dashboard/equipo", "/dashboard/ajustes", "/dashboard/lo-que-sea"]) {
      expect(canAccessPath("owner", p)).toBe(true);
    }
  });
  it("el administrador no entra a ajustes, planes ni equipo", () => {
    expect(canAccessPath("manager", "/dashboard/metricas")).toBe(true);
    expect(canAccessPath("manager", "/dashboard/servicios")).toBe(true);
    for (const p of ["/dashboard/ajustes", "/dashboard/planes", "/dashboard/equipo"]) expect(canAccessPath("manager", p)).toBe(false);
  });
  it("recepción gestiona citas y clientes pero no catálogo ni métricas", () => {
    expect(canAccessPath("reception", "/dashboard/clientes")).toBe(true);
    expect(canAccessPath("reception", "/dashboard/agenda")).toBe(true);
    expect(canAccessPath("reception", "/dashboard/servicios")).toBe(false);
    expect(canAccessPath("reception", "/dashboard/metricas")).toBe(false);
  });
  it("el profesional solo ve resumen, agenda y citas", () => {
    for (const p of ["/dashboard", "/dashboard/agenda", "/dashboard/citas"]) expect(canAccessPath("professional", p)).toBe(true);
    for (const p of ["/dashboard/clientes", "/dashboard/metricas", "/dashboard/servicios", "/dashboard/ajustes"]) {
      expect(canAccessPath("professional", p)).toBe(false);
    }
  });
  it("deniega por defecto rutas desconocidas a los miembros y tolera la barra final", () => {
    expect(canAccessPath("manager", "/dashboard/nueva-seccion")).toBe(false);
    expect(canAccessPath("reception", "/dashboard/agenda/")).toBe(true);
    expect(canAccessPath("reception", "/dashboard/citas/123")).toBe(true);
    expect(canAccessPath(null, "/dashboard")).toBe(false);
  });
});
