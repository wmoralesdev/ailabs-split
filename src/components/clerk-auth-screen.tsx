import { SignIn } from "@clerk/tanstack-react-start"
import { Link, useSearch } from "@tanstack/react-router"

import { SiteLogo } from "@/components/site-logo"
import { PageShell } from "@/components/page-shell"
import { clerkUiEnabled } from "@/lib/clerk-ui"
import { safeRedirectPath } from "@/lib/auth-session"

/** Combined sign-in-or-up. `/sign-in` and `/sign-up` both render this. */
export function ClerkAuthScreen() {
  const search = useSearch({ strict: false })
  const redirectTo = safeRedirectPath(search.redirect) ?? "/"

  return (
    <PageShell innerClassName="flex min-h-dvh flex-col pt-2">
      <header className="flex h-11 items-center">
        <Link
          to="/"
          search={{ stay: true }}
          className="rounded-full transition-opacity outline-none hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Split home"
        >
          <SiteLogo showWordmark={false} markClassName="size-7" />
        </Link>
      </header>

      <div className="animate-rise mt-3">
        <h1 className="font-display text-[34px] leading-tight font-bold tracking-tight text-foreground">
          Sign in
        </h1>
        <p className="mt-1 text-[15px] leading-snug text-muted-foreground">
          Keep dinners and trips on every device. New here? Same screen creates
          your account. Scanning a ticket needs one so AI credits stay with you.
        </p>
      </div>

      <div className="animate-rise-delay pb-safe mt-6 pb-10">
        {clerkUiEnabled() ? (
          <SignIn
            withSignUp
            fallbackRedirectUrl={redirectTo}
            forceRedirectUrl={redirectTo}
            signUpFallbackRedirectUrl={redirectTo}
            signUpForceRedirectUrl={redirectTo}
          />
        ) : (
          <p className="text-[15px] text-muted-foreground">
            Sign-in is available when Clerk is configured for this app.
          </p>
        )}
      </div>
    </PageShell>
  )
}
