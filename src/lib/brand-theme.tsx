import { useMemo } from "react";

export const AVAILABLE_FONTS = [
  "Inter",
  "Manrope",
  "Sora",
  "Poppins",
  "DM Sans",
  "Space Grotesk",
  "Playfair Display",
  "Lora",
] as const;

export type BrandSettings = {
  brand_primary?: string | null;
  brand_background?: string | null;
  brand_font?: string | null;
};

function isValidColor(c?: string | null): c is string {
  if (!c) return false;
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c.trim());
}

/**
 * Wraps children with a div that overrides theme CSS variables based on
 * the business's branding settings. Fields are optional — anything not set
 * falls back to the global neutral theme.
 */
export function BrandTheme({
  brand,
  children,
  className,
}: {
  brand?: BrandSettings | null;
  children: React.ReactNode;
  className?: string;
}) {
  const style = useMemo(() => {
    const s: Record<string, string> = {};
    if (isValidColor(brand?.brand_primary)) {
      s["--primary"] = brand!.brand_primary!;
      s["--ring"] = brand!.brand_primary!;
      s["--sidebar-primary"] = brand!.brand_primary!;
    }
    if (isValidColor(brand?.brand_background)) {
      s["--background"] = brand!.brand_background!;
    }
    if (brand?.brand_font && AVAILABLE_FONTS.includes(brand.brand_font as any)) {
      s["--brand-font"] = `"${brand.brand_font}"`;
    }
    return s as React.CSSProperties;
  }, [brand?.brand_primary, brand?.brand_background, brand?.brand_font]);

  return (
    <div style={style} className={className}>
      {children}
    </div>
  );
}
