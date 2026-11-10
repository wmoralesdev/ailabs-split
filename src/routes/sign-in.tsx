import { createFileRoute, redirect } from "@tanstack/react-router"

import { ClerkAuthScreen } from "@/components/clerk-auth-screen"
import { safeRedirectPath } from "@/lib/auth-session"

type SignInSearch = {
  redirect?: string
}

export const Route = createFileRoute("/sign-in")({
  validateSearch: (search: Record<string, unknown>): SignInSearch => ({
    redirect: safeRedirectPath(search.redirect),
  }),
  beforeLoad: ({ context, search }) => {
    if (!context.userId) return
    throw redirect({ href: search.redirect ?? "/" })
  },
  component: SignInPage,
})

function SignInPage() {
  return <ClerkAuthScreen />
}
