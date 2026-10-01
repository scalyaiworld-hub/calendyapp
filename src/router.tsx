import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Cache agresivo para reducir llamadas al backend
        staleTime: 5 * 60_000, // 5 min frescos → sin refetch al volver
        gcTime: 30 * 60_000, // 30 min en memoria
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchOnMount: false, // si está en caché y fresco, no refetch
        retry: 1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Reusar caché en preloads (evita disparar queries duplicadas al hover)
    defaultPreloadStaleTime: 5 * 60_000,
    // Precargar solo al hacer foco/tocar, no al pasar el mouse → menos queries innecesarias
    defaultPreload: false,
  });

  return router;
};
