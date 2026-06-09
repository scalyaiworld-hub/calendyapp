import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function CardListSkeleton({ rows = 4, withAvatar = false }: { rows?: number; withAvatar?: boolean }) {
  return (
    <Card>
      <CardContent className="p-0">
        <ul className="divide-y divide-border">
          {Array.from({ length: rows }).map((_, i) => (
            <li key={i} className="px-4 py-3 flex items-center gap-3">
              {withAvatar && <div className="size-10 rounded-full bg-muted animate-pulse shrink-0" />}
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-1/3 rounded bg-muted animate-pulse" />
                <div className="h-3 w-1/2 rounded bg-muted/70 animate-pulse" />
              </div>
              <div className="h-7 w-16 rounded bg-muted animate-pulse" />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export function CardGridSkeleton({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid gap-3 md:grid-cols-2", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i}>
          <CardContent className="pt-4 pb-4 flex gap-3">
            <div className="size-14 rounded-full bg-muted animate-pulse shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-1/2 rounded bg-muted animate-pulse" />
              <div className="h-3 w-3/4 rounded bg-muted/70 animate-pulse" />
              <div className="flex gap-1.5 pt-1">
                <div className="h-4 w-16 rounded-full bg-muted animate-pulse" />
                <div className="h-4 w-20 rounded-full bg-muted/70 animate-pulse" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function StatGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className={cn("grid gap-3", count === 3 ? "grid-cols-3" : "grid-cols-2 md:grid-cols-4")}>
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i}>
          <CardContent className="py-4 px-4 space-y-2">
            <div className="h-3 w-1/2 rounded bg-muted/70 animate-pulse" />
            <div className="h-6 w-1/3 rounded bg-muted animate-pulse" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function BlockSkeleton({ className }: { className?: string }) {
  return <div className={cn("rounded-lg bg-muted animate-pulse", className)} />;
}