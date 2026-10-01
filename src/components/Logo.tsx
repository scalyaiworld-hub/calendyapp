import { cn } from "@/lib/utils";

/**
 * Logo de Calendya: ícono SVG + wordmark en texto. El wordmark va como texto (no como <img>)
 * porque un SVG dentro de <img> no puede usar la fuente Outfit cargada por la página.
 */
export function Logo({
  size = 32,
  showWordmark = true,
  className,
  wordmarkClassName,
}: {
  size?: number;
  showWordmark?: boolean;
  className?: string;
  wordmarkClassName?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <img src="/calendya-icon.svg" alt={showWordmark ? "" : "Calendya"} width={size} height={size} className="shrink-0" style={{ width: size, height: size }} />
      {showWordmark && (
        <span
          className={cn("font-semibold tracking-tight text-[#16276b] dark:text-foreground", wordmarkClassName)}
          style={{ fontFamily: "Outfit, sans-serif", fontSize: size * 0.8, letterSpacing: "-0.03em", lineHeight: 1 }}
        >
          calendya
        </span>
      )}
    </span>
  );
}
