import { createRouter as createTanStackRouter } from "@tanstack/react-router"
import { QueryClient } from "@tanstack/react-query"
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query"

import { registerAddExpenseMutationDefaults } from "@/lib/add-expense-mutation"
import {
  QUERY_PERSIST_GC_TIME_MS,
  setupQueryPersist,
} from "@/lib/query-persist"
import { routeTree } from "./routeTree.gen"

export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        refetchOnWindowFocus: true,
        gcTime: QUERY_PERSIST_GC_TIME_MS,
      },
      mutations: {
        networkMode: "online",
      },
    },
  })

  registerAddExpenseMutationDefaults(queryClient)
  setupQueryPersist(queryClient)

  const router = createTanStackRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
  })

  setupRouterSsrQueryIntegration({ router, queryClient })

  return router
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
