import { useEffect, useState } from "react"
import { SignIn } from "@clerk/tanstack-react-start"

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import {
  closeAuthModal,
  openAuthModal,
  storedAuthRedirect,
  useAuthModal,
} from "@/lib/auth-modal"
import { clerkUiEnabled } from "@/lib/clerk-ui"
import { useSignedInUserId } from "@/lib/use-auth-user"

/** `#auth` asks for the modal on load (old `/sign-in` links land with it). */
export const AUTH_HASH = "#auth"

/** Clerk's hash router keeps its own steps (`#/factor-one`, `#/sso-callback`). */
function isClerkHash(hash: string) {
  return hash.startsWith("#/")
}

function clearHash() {
  const { pathname, search } = window.location
  window.history.replaceState(window.history.state, "", `${pathname}${search}`)
}

/**
 * Combined sign-in-or-up over whatever screen is open. Mounted once at the
 * root. Coming back from Google or GitHub, the URL carries `#/sso-callback`,
 * so the modal reopens to finish the flow and then lands on the redirect.
 */
export function AuthModal() {
  const { open, redirect } = useAuthModal()
  const userId = useSignedInUserId()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setReady(true)
    if (userId) return
    const hash = window.location.hash
    if (hash === AUTH_HASH) {
      clearHash()
      openAuthModal()
    } else if (isClerkHash(hash)) {
      openAuthModal({ redirect: storedAuthRedirect() })
    }
  }, [userId])

  if (!ready || !clerkUiEnabled() || userId) return null

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) return
        closeAuthModal()
        if (isClerkHash(window.location.hash)) clearHash()
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto rounded-3xl bg-card p-0 sm:max-w-[25rem]">
        <DialogTitle className="sr-only">Sign in to Split</DialogTitle>
        <SignIn
          routing="hash"
          withSignUp
          fallbackRedirectUrl={redirect}
          forceRedirectUrl={redirect}
          signUpFallbackRedirectUrl={redirect}
          signUpForceRedirectUrl={redirect}
          appearance={{
            elements: {
              rootBox: "w-full",
              cardBox: "w-full max-w-none rounded-3xl border-0 shadow-none",
              card: "w-full max-w-none rounded-none border-0 shadow-none",
              footer: "w-full max-w-none",
            },
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
