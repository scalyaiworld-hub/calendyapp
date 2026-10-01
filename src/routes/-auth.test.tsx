import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  signInWithOAuth: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  navigate: vi.fn(),
  session: null as unknown,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signUp: mocks.signUp,
      signInWithPassword: mocks.signInWithPassword,
      signInWithOAuth: mocks.signInWithOAuth,
      resetPasswordForEmail: mocks.resetPasswordForEmail,
    },
  },
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ session: mocks.session }),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (opts: unknown) => opts,
  useNavigate: () => mocks.navigate,
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to: string }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

import { Route } from "./auth";

const AuthPage = (Route as unknown as { component: React.ComponentType }).component;

function setup() {
  const user = userEvent.setup();
  render(<AuthPage />);
  return user;
}

async function fillAndSubmit(
  user: ReturnType<typeof userEvent.setup>,
  email: string,
  password: string,
  submit: string,
) {
  await user.type(screen.getByLabelText("Email"), email);
  await user.type(screen.getByLabelText("Contraseña"), password);
  await user.click(screen.getByRole("button", { name: submit }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session = null;
  mocks.signUp.mockResolvedValue({ error: null });
  mocks.signInWithPassword.mockResolvedValue({ error: null });
  mocks.signInWithOAuth.mockResolvedValue({ error: null });
  mocks.resetPasswordForEmail.mockResolvedValue({ error: null });
});

describe("AuthPage - alternar modos", () => {
  it("inicia en modo ingresar", () => {
    setup();
    expect(screen.getByText("Bienvenido de vuelta")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ingresar" })).toBeInTheDocument();
    expect(screen.getByText("¿Olvidaste?")).toBeInTheDocument();
  });

  it("cambia a crear cuenta y vuelve", async () => {
    const user = setup();
    await user.click(screen.getByRole("button", { name: "Crear cuenta" }));
    expect(screen.getByText("Crea tu cuenta")).toBeInTheDocument();
    expect(screen.getByText("Mínimo 6 caracteres")).toBeInTheDocument();
    expect(screen.queryByText("¿Olvidaste?")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ingresar" }));
    expect(screen.getByText("Bienvenido de vuelta")).toBeInTheDocument();
  });

  it("modo recuperar oculta contraseña y Google, y permite volver", async () => {
    const user = setup();
    await user.click(screen.getByText("¿Olvidaste?"));
    expect(screen.getByText("Recupera tu contraseña")).toBeInTheDocument();
    expect(screen.queryByLabelText("Contraseña")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Google/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Volver a ingresar/ }));
    expect(screen.getByText("Bienvenido de vuelta")).toBeInTheDocument();
  });

  it("limpia el error al cambiar de modo", async () => {
    mocks.signInWithPassword.mockResolvedValue({ error: new Error("Invalid login credentials") });
    const user = setup();
    await fillAndSubmit(user, "a@b.com", "123456", "Ingresar");
    expect(await screen.findByText("Email o contraseña incorrectos.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Crear cuenta" }));
    expect(screen.queryByText("Email o contraseña incorrectos.")).not.toBeInTheDocument();
  });

  it("alterna visibilidad de la contraseña", async () => {
    const user = setup();
    const input = screen.getByLabelText("Contraseña");
    expect(input).toHaveAttribute("type", "password");
    await user.click(screen.getByRole("button", { name: "Mostrar contraseña" }));
    expect(input).toHaveAttribute("type", "text");
    await user.click(screen.getByRole("button", { name: "Ocultar contraseña" }));
    expect(input).toHaveAttribute("type", "password");
  });
});

describe("AuthPage - validación del formulario", () => {
  it("campos requeridos, email tipo email y minLength 6", () => {
    setup();
    const email = screen.getByLabelText("Email");
    const pass = screen.getByLabelText("Contraseña");
    expect(email).toBeRequired();
    expect(email).toHaveAttribute("type", "email");
    expect(pass).toBeRequired();
    expect(pass).toHaveAttribute("minlength", "6");
  });

  it("no llama a Supabase con el formulario vacío", async () => {
    const user = setup();
    await user.click(screen.getByRole("button", { name: "Ingresar" }));
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });

  // jsdom no implementa la validación nativa de minLength (los navegadores sí), por eso
  // solo se verifica el atributo (arriba); el rechazo de Supabase se cubre con la traducción.
  it("traduce el rechazo del servidor por contraseña corta", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      error: new Error("Password should be at least 6 characters"),
    });
    const user = setup();
    await fillAndSubmit(user, "a@b.com", "123", "Ingresar");
    expect(await screen.findByText("La contraseña debe tener al menos 6 caracteres.")).toBeInTheDocument();
  });

  it("no llama a Supabase con email inválido", async () => {
    const user = setup();
    await fillAndSubmit(user, "no-es-email", "123456", "Ingresar");
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });
});

describe("AuthPage - signInWithPassword", () => {
  it("llama con email y contraseña", async () => {
    const user = setup();
    await fillAndSubmit(user, "a@b.com", "secreto1", "Ingresar");
    await waitFor(() =>
      expect(mocks.signInWithPassword).toHaveBeenCalledWith({ email: "a@b.com", password: "secreto1" }),
    );
    expect(mocks.signUp).not.toHaveBeenCalled();
  });

  it("deshabilita Google durante la llamada y se rehabilita al terminar", async () => {
    let resolve!: (v: unknown) => void;
    mocks.signInWithPassword.mockReturnValue(new Promise((r) => (resolve = r)));
    const user = setup();
    await fillAndSubmit(user, "a@b.com", "secreto1", "Ingresar");
    expect(screen.getByRole("button", { name: /Continuar con Google/ })).toBeDisabled();
    resolve({ error: null });
    await waitFor(() => expect(screen.getByRole("button", { name: "Ingresar" })).toBeEnabled());
  });

  it("redirige a /dashboard si ya hay sesión", () => {
    mocks.session = { user: { id: "1" } };
    setup();
    expect(mocks.navigate).toHaveBeenCalledWith({ to: "/dashboard", replace: true });
  });

  it("no redirige sin sesión", () => {
    setup();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it.each([
    ["Invalid login credentials", "Email o contraseña incorrectos."],
    ["Email not confirmed", "Debes confirmar tu correo antes de ingresar."],
    ["Too many requests", "Demasiados intentos. Espera un momento e inténtalo de nuevo."],
    ["email rate limit exceeded", "Demasiados intentos. Espera un momento e inténtalo de nuevo."],
    ["Failed to fetch", "Problema de conexión. Revisa tu internet."],
    ["Network error", "Problema de conexión. Revisa tu internet."],
    ["Unable to validate email address: invalid format", "El email no es válido."],
    ["Mensaje desconocido", "Mensaje desconocido"],
  ])("traduce el error %s", async (original, esperado) => {
    mocks.signInWithPassword.mockResolvedValue({ error: new Error(original) });
    const user = setup();
    await fillAndSubmit(user, "a@b.com", "secreto1", "Ingresar");
    expect(await screen.findByText(esperado)).toBeInTheDocument();
  });

  it("muestra mensaje genérico si el error no es una instancia de Error", async () => {
    mocks.signInWithPassword.mockRejectedValue("boom");
    const user = setup();
    await fillAndSubmit(user, "a@b.com", "secreto1", "Ingresar");
    expect(await screen.findByText("Algo salió mal")).toBeInTheDocument();
  });
});

describe("AuthPage - signUp", () => {
  it("llama con email, contraseña y emailRedirectTo, y muestra info", async () => {
    const user = setup();
    await user.click(screen.getByRole("button", { name: "Crear cuenta" }));
    await fillAndSubmit(user, "nuevo@b.com", "secreto1", "Crear cuenta");
    await waitFor(() =>
      expect(mocks.signUp).toHaveBeenCalledWith({
        email: "nuevo@b.com",
        password: "secreto1",
        options: { emailRedirectTo: `${window.location.origin}/dashboard` },
      }),
    );
    expect(await screen.findByText("Revisa tu correo para confirmar tu cuenta.")).toBeInTheDocument();
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });

  it.each([
    ["User already registered", "Este email ya tiene una cuenta. Ingresa en su lugar."],
    ["Password should be at least 6 characters", "La contraseña debe tener al menos 6 caracteres."],
    ["Invalid email", "El email no es válido."],
  ])("traduce el error %s", async (original, esperado) => {
    mocks.signUp.mockResolvedValue({ error: new Error(original) });
    const user = setup();
    await user.click(screen.getByRole("button", { name: "Crear cuenta" }));
    await fillAndSubmit(user, "nuevo@b.com", "secreto1", "Crear cuenta");
    expect(await screen.findByText(esperado)).toBeInTheDocument();
    expect(screen.queryByText("Revisa tu correo para confirmar tu cuenta.")).not.toBeInTheDocument();
  });
});

describe("AuthPage - recuperar contraseña", () => {
  it("llama a resetPasswordForEmail y muestra info", async () => {
    const user = setup();
    await user.click(screen.getByText("¿Olvidaste?"));
    await user.type(screen.getByLabelText("Email"), "a@b.com");
    await user.click(screen.getByRole("button", { name: "Enviar enlace" }));
    await waitFor(() =>
      expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith("a@b.com", {
        redirectTo: `${window.location.origin}/reset-password`,
      }),
    );
    expect(await screen.findByText(/Te enviamos un enlace/)).toBeInTheDocument();
  });
});

describe("AuthPage - Google OAuth", () => {
  it("llama a signInWithOAuth con provider google y redirectTo", async () => {
    const user = setup();
    await user.click(screen.getByRole("button", { name: /Continuar con Google/ }));
    expect(mocks.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/dashboard` },
    });
    expect(await screen.findByText("Conectando…")).toBeInTheDocument();
  });

  it("muestra error traducido y reactiva el botón si falla", async () => {
    mocks.signInWithOAuth.mockResolvedValue({ error: new Error("Failed to fetch") });
    const user = setup();
    await user.click(screen.getByRole("button", { name: /Continuar con Google/ }));
    expect(await screen.findByText("Problema de conexión. Revisa tu internet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Continuar con Google/ })).toBeEnabled();
  });

  it("usa mensaje por defecto si el rechazo no es un Error", async () => {
    mocks.signInWithOAuth.mockRejectedValue("x");
    const user = setup();
    await user.click(screen.getByRole("button", { name: /Continuar con Google/ }));
    expect(await screen.findByText("No se pudo iniciar con Google")).toBeInTheDocument();
  });
});
