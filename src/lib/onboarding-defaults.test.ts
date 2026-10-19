import { describe, expect, it } from "vitest";
import { DEFAULT_LOCATION_NAME, defaultProfessionalName } from "./onboarding-defaults";

describe("valores por defecto del onboarding", () => {
  it("usa el nombre del dueño si existe", () => {
    expect(defaultProfessionalName("  Ana Ríos ", "Salón Luna")).toBe("Ana Ríos");
  });

  it("cae al nombre del negocio si no hay nombre del dueño", () => {
    expect(defaultProfessionalName(undefined, "Salón Luna")).toBe("Salón Luna");
    expect(defaultProfessionalName("   ", " Salón Luna ")).toBe("Salón Luna");
    expect(defaultProfessionalName(null, "Salón Luna")).toBe("Salón Luna");
  });

  it("nunca devuelve un nombre vacío ni más largo de 100 caracteres", () => {
    expect(defaultProfessionalName("", "  ")).toBe("Profesional");
    expect(defaultProfessionalName("x".repeat(300), "Salón")).toHaveLength(100);
  });

  it("la sucursal por defecto tiene un nombre fijo y legible", () => {
    expect(DEFAULT_LOCATION_NAME).toBe("Sede principal");
  });
});
