import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Ingresar — AutoCitas" },
      { name: "description", content: "Ingresa o crea tu cuenta de AutoCitas." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (session) navigate({ to: "/dashboard", replace: true });
  }, [session, navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/dashboard` },
        });
        if (error) throw error;
        setInfo("Revisa tu correo para confirmar tu cuenta.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Algo salió mal");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <Link to="/" className="block text-center mb-8 font-display text-2xl">AutoCitas</Link>
        <div className="surface-elev rounded-xl p-8 shadow-rose">
          <div className="flex gap-2 mb-6 p-1 bg-muted/40 rounded-md">
            <button
              type="button"
              onClick={() => setMode("signin")}
              className={`flex-1 py-2 text-sm rounded ${mode === "signin" ? "bg-background shadow" : "text-muted-foreground"}`}
            >
              Ingresar
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={`flex-1 py-2 text-sm rounded ${mode === "signup" ? "bg-background shadow" : "text-muted-foreground"}`}
            >
              Crear cuenta
            </button>
          </div>
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="text-xs uppercase tracking-widest text-muted-foreground">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full px-4 py-3 rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-rose/50"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-widest text-muted-foreground">Contraseña</label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full px-4 py-3 rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-rose/50"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            {info && <p className="text-sm text-rose">{info}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-md gradient-rose text-warm-dark font-semibold disabled:opacity-50"
            >
              {loading ? "Cargando…" : mode === "signin" ? "Ingresar" : "Crear cuenta"}
            </button>
          </form>
        </div>
        <p className="text-center text-xs text-muted-foreground mt-6">
          <Link to="/" className="hover:text-foreground">← Volver al inicio</Link>
        </p>
      </div>
    </div>
  );
}