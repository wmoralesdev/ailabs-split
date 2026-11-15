import { UserButton } from "@clerk/tanstack-react-start"
import { useRouterState } from "@tanstack/react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ComputerIcon,
  Moon02Icon,
  Sun01Icon,
} from "@hugeicons/core-free-icons"

import { useTheme } from "@/components/theme-provider"
import type { Theme } from "@/components/theme-provider"
import { ThemeToggle } from "@/components/theme-toggle"
import { openAuthModal } from "@/lib/auth-modal"
import { clerkUiEnabled } from "@/lib/clerk-ui"
import { useSignedInUserId } from "@/lib/use-auth-user"

const NEXT_THEME: Record<Theme, { label: string; icon: typeof Moon02Icon }> = {
  light: { label: "Dark mode", icon: Moon02Icon },
  dark: { label: "Match system theme", icon: ComputerIcon },
  system: { label: "Light mode", icon: Sun01Icon },
}

/** Account entry: the avatar menu (with the theme switch) or "Sign in". */
export function AuthControls() {
  const userId = useSignedInUserId()
  const { theme, toggleTheme } = useTheme()
  const next = NEXT_THEME[theme]
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
        >
          <UserButton.MenuItems>
            <UserButton.Action
              label={next.label}
              labelIcon={
                <HugeiconsIcon icon={next.icon} size={16} strokeWidth={2} />
              }
              onClick={toggleTheme}
            />
          </UserButton.MenuItems>
        </UserButton>
      )
    }
    return <ThemeToggle />
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
