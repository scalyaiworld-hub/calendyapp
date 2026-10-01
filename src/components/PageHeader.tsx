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
    <div className="flex items-end justify-between gap-4 flex-wrap pb-6 mb-8">
      <div className="min-w-0">
        {eyebrow && (
          <p className="font-mono text-[13px] uppercase tracking-[0.12em] text-primary mb-3">
            {eyebrow}
          </p>
        )}
        <h1 className="font-display text-4xl md:text-5xl leading-[1.05] mb-3">{title}</h1>
        {description && <p className="text-muted-foreground text-base max-w-xl">{description}</p>}
      </div>
      {actions && <div className="flex gap-2 flex-wrap shrink-0">{actions}</div>}
    </div>
  );
}
