import { AuthenticateWithRedirectCallback } from "@clerk/tanstack-react-start"
import { createFileRoute } from "@tanstack/react-router"

import { clerkUiEnabled } from "@/lib/clerk-ui"

export const Route = createFileRoute("/sign-in_/sso-callback")({
  component: SsoCallbackPage,
})

function SsoCallbackPage() {
  if (!clerkUiEnabled()) {
    return (
      <p className="page-gutter mx-auto max-w-content pt-10 text-[15px] text-muted-foreground">
        Signing in…
      </p>
    )
  }
  return <AuthenticateWithRedirectCallback />
}
