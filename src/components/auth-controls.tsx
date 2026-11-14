import { UserButton } from "@clerk/tanstack-react-start"
import { useRouterState } from "@tanstack/react-router"

import { openAuthModal } from "@/lib/auth-modal"
import { clerkUiEnabled } from "@/lib/clerk-ui"
import { useSignedInUserId } from "@/lib/use-auth-user"

export function AuthControls() {
  const userId = useSignedInUserId()
  const href = useRouterState({
    select: (state) => `${state.location.pathname}${state.location.searchStr}`,
  })

  if (userId) {
    if (clerkUiEnabled()) {
      return (
        <UserButton
          appearance={{
            elements: {
              avatarBox: "size-8",
            },
          }}
        />
      )
    }
    return (
      <span className="px-2 text-[13px] font-medium text-muted-foreground">
        Signed in
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={() => openAuthModal({ redirect: href || "/" })}
      className="split-cta h-8 px-3 text-[13px]"
    >
      Sign in
    </button>
  )
}
