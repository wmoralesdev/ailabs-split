import { createFileRoute, redirect } from "@tanstack/react-router"

import { ClerkAuthScreen } from "@/components/clerk-auth-screen"
import { safeRedirectPath } from "@/lib/auth-session"

type SignUpSearch = {
  redirect?: string
}

export const Route = createFileRoute("/sign-up")({
  validateSearch: (search: Record<string, unknown>): SignUpSearch => ({
    redirect: safeRedirectPath(search.redirect),
  }),
  beforeLoad: ({ context, search }) => {
    if (!context.userId) return
    throw redirect({ href: search.redirect ?? "/" })
  },
  component: SignUpPage,
})

function SignUpPage() {
  return <ClerkAuthScreen />
}
