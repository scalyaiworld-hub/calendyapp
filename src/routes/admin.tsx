import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowUpCircle,
  Building2,
  Inbox,
  Search,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import {
  getAdminOverview,
  getAdminStatus,
  setBusinessPlan,
  setUpgradeRequestStatus,
  type AdminBusiness,
} from "@/lib/api/admin.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [{ title: "Admin — Calendya" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: AdminPage,
});

const PLAN_LABEL: Record<string, string> = { free: "Free", pro: "Pro", studio: "Studio" };

const dateFmt = (iso: string) =>
  new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });

function AdminPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", replace: true });
  }, [loading, user, navigate]);

  const status = useQuery({
    queryKey: ["admin-status", user?.id],
    enabled: !!user,
    queryFn: () => getAdminStatus(),
    staleTime: 60_000,
    retry: false,
  });

  if (loading || !user || status.isPending) {
    return (
      <div className="min-h-screen grid place-items-center text-muted-foreground">Cargando…</div>
    );
  }

  if (status.isError) {
    return (
      <div className="min-h-screen grid place-items-center px-6">
        <div className="max-w-sm text-center space-y-4">
          <ShieldAlert className="size-10 mx-auto text-destructive" aria-hidden />
          <h1 className="font-display text-2xl">No se pudo verificar el acceso</h1>
          <p
            role="alert"
            className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2"
          >
            {(status.error as Error).message}
          </p>
          <Button variant="outline" onClick={() => status.refetch()}>
            Reintentar
          </Button>
        </div>
      </div>
    );
  }

  if (!status.data?.isAdmin) {
    return (
      <div className="min-h-screen grid place-items-center px-6">
        <div className="max-w-sm text-center space-y-4">
          <ShieldAlert className="size-10 mx-auto text-muted-foreground" aria-hidden />
          <h1 className="font-display text-2xl">Acceso restringido</h1>
          <p className="text-sm text-muted-foreground">
            Esta sección es solo para administradores de Calendya.
          </p>
          <Button asChild variant="outline">
            <Link to="/dashboard">Volver al dashboard</Link>
          </Button>
        </div>
      </div>
    );
  }

  return <AdminPanel email={user.email ?? ""} />;
}

function AdminPanel({ email }: { email: string }) {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(0);

  // La búsqueda y la paginación las resuelve el servidor (SQL); se espera a que el usuario deje de escribir.
  useEffect(() => {
    const id = setTimeout(() => {
      setDebounced(query.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(id);
  }, [query]);

  const overview = useQuery({
    queryKey: ["admin-overview", debounced, page],
    queryFn: () => getAdminOverview({ data: { search: debounced || undefined, page } }),
    placeholderData: (prev) => prev,
  });

  const changePlan = useMutation({
    mutationFn: (v: { businessId: string; plan: "free" | "pro" | "studio" }) =>
      setBusinessPlan({ data: v }),
    onSuccess: () => {
      toast.success("Plan actualizado");
      qc.invalidateQueries({ queryKey: ["admin-overview"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const changeRequestStatus = useMutation({
    mutationFn: (v: { requestId: string; status: "new" | "contacted" | "won" | "lost" }) =>
      setUpgradeRequestStatus({ data: v }),
    onSuccess: () => {
      toast.success("Solicitud actualizada");
      qc.invalidateQueries({ queryKey: ["admin-overview"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const businesses = overview.data?.businesses ?? [];
  const totalPages = Math.max(
    1,
    Math.ceil((overview.data?.businessesTotal ?? 0) / (overview.data?.pageSize ?? 50)),
  );

  const totals = overview.data?.totals;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="size-5 text-primary" aria-hidden />
            <h1 className="font-display text-lg font-semibold tracking-tight">
              Panel de administración
            </h1>
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="hidden sm:inline">{email}</span>
            <Link
              to="/inicio"
              className="inline-flex items-center gap-1 hover:text-foreground py-2"
            >
              <ArrowLeft className="size-3.5" aria-hidden /> Inicio
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        <section aria-label="Resumen" className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <Stat label="Negocios" value={totals?.businesses} loading={overview.isLoading} />
          <Stat label="Plan Free" value={totals?.free} loading={overview.isLoading} />
          <Stat label="Plan Pro" value={totals?.pro} loading={overview.isLoading} />
          <Stat label="Plan Studio" value={totals?.studio} loading={overview.isLoading} />
          <Stat
            label="Upgrades nuevos"
            value={totals?.upgradeRequests}
            loading={overview.isLoading}
          />
          <Stat label="Solicitudes" value={totals?.preregistrations} loading={overview.isLoading} />
        </section>

        {overview.isError && (
          <div
            role="alert"
            className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2"
          >
            {(overview.error as Error).message}
          </div>
        )}

        <Tabs defaultValue="businesses">
          <TabsList>
            <TabsTrigger value="businesses" className="gap-2">
              <Building2 className="size-4" aria-hidden /> Negocios
            </TabsTrigger>
            <TabsTrigger value="upgrades" className="gap-2">
              <ArrowUpCircle className="size-4" aria-hidden /> Upgrades
            </TabsTrigger>
            <TabsTrigger value="requests" className="gap-2">
              <Inbox className="size-4" aria-hidden /> Solicitudes
            </TabsTrigger>
          </TabsList>

          <TabsContent value="businesses" className="space-y-4">
            <div className="relative max-w-sm">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none"
                aria-hidden
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por nombre, link o email"
                aria-label="Buscar negocios"
                className="pl-9"
              />
            </div>
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Negocio</TableHead>
                      <TableHead>Dueño</TableHead>
                      <TableHead>Alta</TableHead>
                      <TableHead className="text-right">Citas del mes</TableHead>
                      <TableHead className="w-36">Plan</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overview.isLoading &&
                      Array.from({ length: 4 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell colSpan={5}>
                            <Skeleton className="h-6 w-full" />
                          </TableCell>
                        </TableRow>
                      ))}
                    {!overview.isLoading && businesses.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-10">
                          {query
                            ? "Ningún negocio coincide con la búsqueda."
                            : "Todavía no hay negocios registrados."}
                        </TableCell>
                      </TableRow>
                    )}
                    {businesses.map((b) => (
                      <BusinessRow
                        key={b.id}
                        b={b}
                        pending={changePlan.isPending && changePlan.variables?.businessId === b.id}
                        onPlan={(plan) => changePlan.mutate({ businessId: b.id, plan })}
                      />
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                {overview.data?.businessesTotal ?? 0} negocio(s) · página {page + 1} de {totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page + 1 >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Siguiente
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="upgrades">
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead>Negocio</TableHead>
                      <TableHead>Contacto</TableHead>
                      <TableHead>Rubro</TableHead>
                      <TableHead>Mensaje</TableHead>
                      <TableHead className="w-36">Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!overview.isLoading && (overview.data?.upgradeRequests.length ?? 0) === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                          No hay solicitudes de upgrade.
                        </TableCell>
                      </TableRow>
                    )}
                    {overview.data?.upgradeRequests.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="whitespace-nowrap">{dateFmt(r.createdAt)}</TableCell>
                        <TableCell>
                          <Badge variant={r.plan === "studio" ? "default" : "secondary"}>
                            {PLAN_LABEL[r.plan] ?? r.plan}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{r.businessName ?? "—"}</div>
                          {r.businessSlug && (
                            <div className="text-xs text-muted-foreground">/b/{r.businessSlug}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{r.name}</div>
                          <a
                            href={`mailto:${r.email}`}
                            className="text-primary hover:underline text-sm"
                          >
                            {r.email}
                          </a>
                          {r.phone && (
                            <div className="text-xs text-muted-foreground">{r.phone}</div>
                          )}
                        </TableCell>
                        <TableCell>{r.industry}</TableCell>
                        <TableCell className="max-w-xs text-sm text-muted-foreground">
                          {r.message ?? "—"}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={r.status}
                            onValueChange={(v) =>
                              changeRequestStatus.mutate({
                                requestId: r.id,
                                status: v as "new" | "contacted" | "won" | "lost",
                              })
                            }
                            disabled={changeRequestStatus.isPending}
                          >
                            <SelectTrigger aria-label={`Estado de la solicitud de ${r.name}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(REQUEST_STATUS_LABEL).map(([id, label]) => (
                                <SelectItem key={id} value={id}>
                                  {label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="requests">
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Negocio</TableHead>
                      <TableHead>Teléfono</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!overview.isLoading && (overview.data?.preregistrations.length ?? 0) === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-10">
                          No hay solicitudes de preregistro.
                        </TableCell>
                      </TableRow>
                    )}
                    {overview.data?.preregistrations.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="whitespace-nowrap">{dateFmt(p.createdAt)}</TableCell>
                        <TableCell className="font-medium">{p.nombre}</TableCell>
                        <TableCell>
                          <a href={`mailto:${p.email}`} className="text-primary hover:underline">
                            {p.email}
                          </a>
                        </TableCell>
                        <TableCell>{p.negocio ?? "—"}</TableCell>
                        <TableCell>{p.telefono ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

const REQUEST_STATUS_LABEL: Record<string, string> = {
  new: "Nueva",
  contacted: "Contactada",
  won: "Ganada",
  lost: "Perdida",
};

function Stat({
  label,
  value,
  loading,
}: {
  label: string;
  value: number | undefined;
  loading: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        {loading ? (
          <Skeleton className="h-9 w-14" />
        ) : (
          <div className="font-display text-3xl font-bold tabular-nums">{value ?? 0}</div>
        )}
        <div className="text-xs uppercase tracking-widest text-muted-foreground mt-1">{label}</div>
      </CardContent>
    </Card>
  );
}

function BusinessRow({
  b,
  pending,
  onPlan,
}: {
  b: AdminBusiness;
  pending: boolean;
  onPlan: (plan: "free" | "pro" | "studio") => void;
}) {
  return (
    <TableRow className={b.deleted ? "opacity-50" : undefined}>
      <TableCell>
        <div className="font-medium">{b.name}</div>
        <div className="text-xs text-muted-foreground">
          /b/{b.slug}
          {!b.onboardingCompleted && (
            <Badge variant="outline" className="ml-2">
              Sin terminar onboarding
            </Badge>
          )}
          {b.deleted && (
            <Badge variant="outline" className="ml-2">
              Eliminado
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell>{b.ownerEmail ?? "—"}</TableCell>
      <TableCell className="whitespace-nowrap">{dateFmt(b.createdAt)}</TableCell>
      <TableCell className="text-right tabular-nums">{b.apptsThisMonth}</TableCell>
      <TableCell>
        <Select
          value={b.plan}
          onValueChange={(v) => onPlan(v as "free" | "pro" | "studio")}
          disabled={pending}
        >
          <SelectTrigger aria-label={`Plan de ${b.name}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(PLAN_LABEL).map(([id, label]) => (
              <SelectItem key={id} value={id}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
    </TableRow>
  );
}
