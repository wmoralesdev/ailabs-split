import {
  useNavigate,
  useRouteContext,
  useRouterState,
} from "@tanstack/react-router"

export function useSignedInUserId(): string | null {
  return useRouteContext({ from: "__root__" }).userId
}

/** Synchronous so a file picker still opens inside the same tap when allowed. */
export function useRequireSignIn(): () => boolean {
  const userId = useSignedInUserId()
  const navigate = useNavigate()
  const href = useRouterState({
    select: (state) => `${state.location.pathname}${state.location.searchStr}`,
  })

  return () => {
    if (userId) return true
    void navigate({
      to: "/sign-in",
      search: { redirect: href || "/" },
    })
    return false
  }
}
