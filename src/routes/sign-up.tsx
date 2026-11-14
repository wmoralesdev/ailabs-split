import { createFileRoute, redirect } from "@tanstack/react-router"

import { AUTH_HASH } from "@/components/auth-modal"
import { safeRedirectPath } from "@/lib/auth-session"

/**
 * Not a page: sign-in is a modal over the app. Old links (and Clerk's
 * `signInUrl`) land on the target screen with the modal open.
 */
export const Route = createFileRoute("/sign-up")({
  beforeLoad: ({ context, search }) => {
    const target = safeRedirectPath(
      (search as Record<string, unknown>).redirect
    )
    const hash = context.userId ? "" : AUTH_HASH
    throw redirect({ href: `${target ?? "/"}${hash}` })
  },
})
