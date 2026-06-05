import { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="flex items-end justify-between gap-4 flex-wrap pb-6 border-b border-border mb-6">
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground font-medium mb-2">
            {eyebrow}
          </p>
        )}
        <h1 className="font-display text-3xl md:text-4xl tracking-tight leading-none mb-2">
          {title}
        </h1>
        {description && (
          <p className="text-muted-foreground text-sm md:text-base max-w-xl">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex gap-2 flex-wrap shrink-0">{actions}</div>}
    </div>
  );
}