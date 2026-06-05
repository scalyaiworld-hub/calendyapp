import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Cachear datos por 30s antes de marcar como obsoletos
        staleTime: 30_000,
        // Mantener en memoria 5 min para que volver a una pantalla sea instantáneo
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    // Precargar la ruta cuando el usuario pasa el mouse / toca el link
    defaultPreload: "intent",
    defaultPreloadDelay: 30,
  });

  return router;
};
