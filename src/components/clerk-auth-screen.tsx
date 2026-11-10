import { SignIn, SignUp } from "@clerk/tanstack-react-start"
import { Link, useSearch } from "@tanstack/react-router"

import { SiteLogo } from "@/components/site-logo"
import { PageShell } from "@/components/page-shell"
import { clerkUiEnabled } from "@/lib/clerk-ui"
import { safeRedirectPath } from "@/lib/auth-session"

type AuthMode = "sign-in" | "sign-up"

export function ClerkAuthScreen({ mode }: { mode: AuthMode }) {
  const search = useSearch({ strict: false }) as { redirect?: string }
  const redirectTo = safeRedirectPath(search.redirect) ?? "/"
  const heading = mode === "sign-in" ? "Sign in" : "Create account"

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
          {heading}
        </h1>
        <p className="mt-1 text-[15px] leading-snug text-muted-foreground">
          Keep dinners and trips on every device. Scanning a ticket needs an
          account so AI credits stay with you.
        </p>
      </div>

      <div className="animate-rise-delay pb-safe mt-6 pb-10">
        {clerkUiEnabled() ? (
          <ClerkWidgets mode={mode} redirectTo={redirectTo} />
        ) : (
          <p className="text-[15px] text-muted-foreground">
            Sign-in is available when Clerk is configured for this app.
          </p>
        )}
        <p className="mt-6 text-[13px] text-muted-foreground">
          {mode === "sign-in" ? (
            <>
              No account?{" "}
              <Link
                to="/sign-up"
                search={{ redirect: redirectTo }}
                className="text-action"
              >
                Create one
              </Link>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <Link
                to="/sign-in"
                search={{ redirect: redirectTo }}
                className="text-action"
              >
                Sign in
              </Link>
            </>
          )}
        </p>
      </div>
    </PageShell>
  )
}

function ClerkWidgets({
  mode,
  redirectTo,
}: {
  mode: AuthMode
  redirectTo: string
}) {
  switch (mode) {
    case "sign-in":
      return (
        <SignIn
          signUpUrl="/sign-up"
          fallbackRedirectUrl={redirectTo}
          forceRedirectUrl={redirectTo}
        />
      )
    case "sign-up":
      return (
        <SignUp
          signInUrl="/sign-in"
          fallbackRedirectUrl={redirectTo}
          forceRedirectUrl={redirectTo}
        />
      )
    default: {
      const _exhaustive: never = mode
      return _exhaustive
    }
  }
}
