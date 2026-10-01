import { describe, expect, it } from "vitest";
import { resolveBrand } from "./brand-theme";

const brand = { brand_primary: "#ff0000", brand_background: "#ffffff", brand_font: "Sora" };

describe("resolveBrand", () => {
  it("ignora la marca guardada en planes sin el módulo", () => {
    expect(resolveBrand({ plan: "free", ...brand })).toBeNull();
    expect(resolveBrand({ plan: null, ...brand })).toBeNull();
    expect(resolveBrand(null)).toBeNull();
  });
  it("aplica la marca en Pro y Studio", () => {
    expect(resolveBrand({ plan: "pro", ...brand })).toEqual(brand);
    expect(resolveBrand({ plan: "studio", ...brand })).toEqual(brand);
  });
});
