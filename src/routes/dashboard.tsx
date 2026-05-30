import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — AutoCitas" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", replace: true });
  }, [user, loading, navigate]);

  if (loading || !user) {
    return <div className="min-h-screen grid place-items-center text-muted-foreground">Cargando…</div>;
  }

  return (
    <div className="min-h-screen px-6 py-12 max-w-4xl mx-auto">
      <header className="flex items-center justify-between mb-12">
        <Link to="/" className="font-display text-2xl">AutoCitas</Link>
        <button onClick={signOut} className="text-sm text-muted-foreground hover:text-foreground">
          Cerrar sesión
        </button>
      </header>
      <h1 className="font-display text-4xl mb-4">Bienvenida, {user.email}</h1>
      <p className="text-muted-foreground">
        Tu dashboard estará aquí pronto: agenda, servicios, clientes y métricas.
      </p>
    </div>
  );
}