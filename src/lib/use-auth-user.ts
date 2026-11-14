import { useRouteContext, useRouterState } from "@tanstack/react-router"

import { openAuthModal } from "@/lib/auth-modal"

export function useSignedInUserId(): string | null {
  return useRouteContext({ from: "__root__" }).userId
}

/** Synchronous so a file picker still opens inside the same tap when allowed. */
export function useRequireSignIn(): () => boolean {
  const userId = useSignedInUserId()
  const href = useRouterState({
    select: (state) => `${state.location.pathname}${state.location.searchStr}`,
  })

  return () => {
    if (userId) return true
    openAuthModal({ redirect: href || "/" })
    return false
  }
}
