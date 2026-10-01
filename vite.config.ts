import { defineConfig, loadEnv } from "vite";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import react from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";

// Orden de plugins: tanstackStart antes que nitro y react.
export default defineConfig(({ command, mode }) => {
  // Solo las variables VITE_* se inyectan al cliente; nunca secretos.
  const define = Object.fromEntries(
    Object.entries(loadEnv(mode, process.cwd(), "VITE_")).map(([key, value]) => [
      `import.meta.env.${key}`,
      JSON.stringify(value),
    ]),
  );

  // Estas variables se incrustan en el bundle al compilar: si faltan, el build "sale bien"
  // y la app se rompe en el navegador. Mejor fallar aquí con un mensaje claro.
  if (command === "build") {
    const env = loadEnv(mode, process.cwd(), "VITE_");
    const missing = ["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY"].filter((k) => !env[k]);
    if (missing.length > 0) {
      throw new Error(
        `Faltan variables de entorno para compilar: ${missing.join(", ")}. ` +
          "Defínelas en el hosting (p. ej. Vercel → Settings → Environment Variables) o en .env y vuelve a compilar.",
      );
    }
  }

  return {
    define,
    server: { host: "::", port: 8080 },
    resolve: {
      alias: { "@": path.resolve(process.cwd(), "src") },
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
      ],
      ignoreOutdatedRequests: true,
    },
    plugins: [
      tailwindcss(),
      tsConfigPaths({ projects: ["./tsconfig.json"] }),
      tanstackStart({
        // Redirige el server entry de TanStack Start a src/server.ts (wrapper de errores SSR).
        server: { entry: "server" },
        importProtection: {
          behavior: "error",
          client: { files: ["**/server/**"], specifiers: ["server-only"] },
        },
      }),
      // Nitro solo en build; destino por defecto: Cloudflare.
      ...(command === "build" ? [nitro({ defaultPreset: "cloudflare-module" })] : []),
      react(),
    ],
  };
});
