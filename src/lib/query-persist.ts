import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister"
import type { QueryClient } from "@tanstack/react-query"
import { persistQueryClient } from "@tanstack/react-query-persist-client"

import { ADD_EXPENSE_MUTATION_KEY } from "@/lib/add-expense-mutation"
import { roomKeys } from "@/lib/room-query"

const PERSIST_MAX_AGE_MS = 1000 * 60 * 60 * 24
const PERSIST_KEY = "split:rq-cache"

function resumePaused(queryClient: QueryClient) {
  void queryClient.resumePausedMutations()
}

/**
 * Persist room queries + paused addExpense mutations in localStorage.
 * Client-only — safe with TanStack Start SSR (no-op on server).
 */
export function setupQueryPersist(queryClient: QueryClient): () => void {
  if (typeof window === "undefined") return () => undefined

  const persister = createAsyncStoragePersister({
    storage: window.localStorage,
    key: PERSIST_KEY,
  })

  const [unsubscribe, restorePromise] = persistQueryClient({
    queryClient,
    persister,
    maxAge: PERSIST_MAX_AGE_MS,
    dehydrateOptions: {
      shouldDehydrateQuery: (query) =>
        query.queryKey[0] === roomKeys.all[0] && query.state.status === "success",
      shouldDehydrateMutation: (mutation) =>
        mutation.options.mutationKey?.[0] === ADD_EXPENSE_MUTATION_KEY[0] &&
        mutation.state.isPaused,
    },
  })

  void restorePromise.then(() => {
    resumePaused(queryClient)
  })

  const onOnline = () => resumePaused(queryClient)
  const onVisibility = () => {
    if (document.visibilityState === "visible") {
      resumePaused(queryClient)
    }
  }
  const onPageShow = () => resumePaused(queryClient)

  window.addEventListener("online", onOnline)
  document.addEventListener("visibilitychange", onVisibility)
  window.addEventListener("pageshow", onPageShow)

  return () => {
    unsubscribe()
    window.removeEventListener("online", onOnline)
    document.removeEventListener("visibilitychange", onVisibility)
    window.removeEventListener("pageshow", onPageShow)
  }
}

export const QUERY_PERSIST_GC_TIME_MS = PERSIST_MAX_AGE_MS
