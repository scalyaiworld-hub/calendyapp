import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Loader2, Mail, Lock, ArrowLeft, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Ingresar — Calendya" },
      { name: "description", content: "Ingresa o crea tu cuenta de Calendya." },
    ],
  }),
  component: AuthPage,
});

type Mode = "signin" | "signup" | "forgot";

function translateError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("invalid login credentials")) return "Email o contraseña incorrectos.";
  if (m.includes("email not confirmed")) return "Debes confirmar tu correo antes de ingresar.";
  if (m.includes("user already registered")) return "Este email ya tiene una cuenta. Ingresa en su lugar.";
  if (m.includes("password should be at least")) return "La contraseña debe tener al menos 6 caracteres.";
  if (m.includes("rate limit") || m.includes("too many")) return "Demasiados intentos. Espera un momento e inténtalo de nuevo.";
  if (m.includes("network") || m.includes("failed to fetch")) return "Problema de conexión. Revisa tu internet.";
  if (m.includes("invalid email") || m.includes("unable to validate email")) return "El email no es válido.";
  return msg;
}

function AuthPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (session) navigate({ to: "/dashboard", replace: true });
  }, [session, navigate]);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setInfo(null);
  };

  const handleGoogle = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) throw result.error;
    } catch (err) {
      setError(err instanceof Error ? translateError(err.message) : "No se pudo iniciar con Google");
      setGoogleLoading(false);
    }
  };

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
      } else if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setInfo("Te enviamos un enlace para restablecer tu contraseña. Revisa tu correo.");
      }
    } catch (err) {
      setError(err instanceof Error ? translateError(err.message) : "Algo salió mal");
    } finally {
      setLoading(false);
    }
  };

  const title =
    mode === "signin" ? "Bienvenido de vuelta" : mode === "signup" ? "Crea tu cuenta" : "Recupera tu contraseña";
  const subtitle =
    mode === "signin"
      ? "Ingresa para gestionar tu salón"
      : mode === "signup"
      ? "Empieza a recibir reservas en minutos"
      : "Te enviaremos un enlace a tu correo";
  const submitLabel =
    mode === "signin" ? "Ingresar" : mode === "signup" ? "Crear cuenta" : "Enviar enlace";

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8 sm:px-6 sm:py-12 bg-gradient-to-br from-background via-background to-primary/5">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2">
            <img src="/logo.png" alt="Calendya" className="h-10 w-10 rounded-xl" />
            <span className="font-display text-3xl gradient-rose-text">Calendya</span>
          </Link>
          <h1 className="font-display text-2xl mt-6 mb-2">{title}</h1>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>

        <div className="surface-elev rounded-2xl p-6 sm:p-7 shadow-rose space-y-5">
          {mode !== "forgot" && (
            <>
              <Button
                type="button"
                variant="outline"
                className="w-full h-12 text-base font-medium gap-3"
                onClick={handleGoogle}
                disabled={googleLoading || loading}
              >
                {googleLoading ? <Loader2 className="size-5 animate-spin" /> : <GoogleIcon />}
                {googleLoading ? "Conectando…" : "Continuar con Google"}
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
                <div className="relative flex justify-center text-xs uppercase tracking-widest">
                  <span className="bg-card px-3 text-muted-foreground">o con email</span>
                </div>
              </div>
            </>
          )}

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <div className="relative mt-1.5">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" aria-hidden />
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11 pl-9"
                  placeholder="tu@email.com"
                />
              </div>
            </div>

            {mode !== "forgot" && (
              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Contraseña</Label>
                  {mode === "signin" && (
                    <button
                      type="button"
                      onClick={() => switchMode("forgot")}
                      className="text-xs text-primary hover:underline"
                    >
                      ¿Olvidaste?
                    </button>
                  )}
                </div>
                <div className="relative mt-1.5">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" aria-hidden />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-11 pl-9 pr-10"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                {mode === "signup" && (
                  <p className="text-xs text-muted-foreground mt-1.5">Mínimo 6 caracteres</p>
                )}
              </div>
            )}

            {error && (
              <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                {error}
              </div>
            )}
            {info && (
              <div className="text-sm text-primary bg-primary/10 border border-primary/20 rounded-lg px-3 py-2 flex items-start gap-2">
                <CheckCircle2 className="size-4 mt-0.5 shrink-0" />
                <span>{info}</span>
              </div>
            )}

            <Button type="submit" disabled={loading || googleLoading} className="w-full h-11 text-base">
              {loading ? <Loader2 className="size-5 animate-spin" /> : submitLabel}
            </Button>
          </form>

          {mode === "forgot" ? (
            <button
              type="button"
              onClick={() => switchMode("signin")}
              className="w-full text-center text-sm text-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-1"
            >
              <ArrowLeft className="size-3.5" /> Volver a ingresar
            </button>
          ) : (
            <p className="text-center text-sm text-muted-foreground">
              {mode === "signin" ? "¿No tienes cuenta?" : "¿Ya tienes cuenta?"}{" "}
              <button
                type="button"
                onClick={() => switchMode(mode === "signin" ? "signup" : "signin")}
                className="text-primary font-medium hover:underline"
              >
                {mode === "signin" ? "Crear cuenta" : "Ingresar"}
              </button>
            </p>
          )}
        </div>

        {mode === "signup" && (
          <p className="text-center text-xs text-muted-foreground mt-4 px-4">
            Al crear tu cuenta aceptas nuestros{" "}
            <Link to="/terminos" className="text-primary hover:underline">Términos</Link> y la{" "}
            <Link to="/privacidad" className="text-primary hover:underline">Política de privacidad</Link>.
          </p>
        )}

        <p className="text-center text-xs text-muted-foreground mt-6">
          <Link to="/" className="hover:text-foreground inline-flex items-center gap-1">
            <ArrowLeft className="size-3.5" /> Volver al inicio
          </Link>
        </p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}