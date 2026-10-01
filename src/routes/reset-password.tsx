import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Loader2, Lock, ArrowLeft, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Restablecer contraseña — Calendya" },
      { name: "description", content: "Elige una nueva contraseña para tu cuenta de Calendya." },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // Supabase pone la sesión de recuperación al abrir el link
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      setTimeout(() => navigate({ to: "/dashboard", replace: true }), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar la contraseña");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8 sm:px-6 sm:py-12 bg-gradient-to-br from-background via-background to-primary/5">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2">
            <img src="/logo.png" alt="Calendya" className="h-10 w-10 rounded-xl" />
            <span className="font-display text-3xl gradient-rose-text">Calendya</span>
          </Link>
          <h1 className="font-display text-2xl mt-6 mb-2">Nueva contraseña</h1>
          <p className="text-sm text-muted-foreground">
            Elige una contraseña segura para tu cuenta.
          </p>
        </div>

        <div className="surface-elev rounded-2xl p-6 sm:p-7 shadow-rose space-y-5">
          {!ready ? (
            <p className="text-sm text-muted-foreground text-center">
              Este enlace debe abrirse desde el correo de recuperación. Si llegaste aquí sin ese
              enlace, solicita uno nuevo desde{" "}
              <Link to="/auth" className="text-primary hover:underline">
                ingresar
              </Link>
              .
            </p>
          ) : done ? (
            <div className="text-sm text-primary bg-primary/10 border border-primary/20 rounded-lg px-3 py-3 flex items-start gap-2">
              <CheckCircle2 className="size-4 mt-0.5 shrink-0" />
              <span>Contraseña actualizada. Te llevamos al panel…</span>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <Label htmlFor="password">Nueva contraseña</Label>
                <div className="relative mt-1.5">
                  <Lock
                    className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none"
                    aria-hidden
                  />
                  <Input
                    id="password"
                    type={show ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-11 pl-9 pr-10"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShow((s) => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
                  >
                    {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground mt-1.5">Mínimo 6 caracteres</p>
              </div>

              <div>
                <Label htmlFor="confirm">Confirmar contraseña</Label>
                <div className="relative mt-1.5">
                  <Lock
                    className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none"
                    aria-hidden
                  />
                  <Input
                    id="confirm"
                    type={show ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    minLength={6}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className="h-11 pl-9"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              {error && (
                <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}

              <Button type="submit" disabled={loading} className="w-full h-11 text-base">
                {loading ? <Loader2 className="size-5 animate-spin" /> : "Guardar contraseña"}
              </Button>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          <Link to="/auth" className="hover:text-foreground inline-flex items-center gap-1">
            <ArrowLeft className="size-3.5" /> Volver a ingresar
          </Link>
        </p>
      </div>
    </div>
  );
}
