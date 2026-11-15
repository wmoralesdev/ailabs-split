import type { ReactNode } from "react"
import { useEffect, useRef, useState } from "react"
import { Link, useRouterState } from "@tanstack/react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons"

import { AuthControls } from "@/components/auth-controls"
import { SiteLogo } from "@/components/site-logo"
import {
  findScrollParent,
  readScrollTop,
  subscribeScroll,
} from "@/lib/scroll-parent"
import { cn } from "@/lib/utils"

const SCROLL_THRESHOLD = 12

/** Whether the nearest scroller has passed the header's frosted-glass threshold. */
function useScrolled(threshold: number) {
  const hostRef = useRef<HTMLElement>(null)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const scroller = findScrollParent(hostRef.current)
    function onScroll() {
      setScrolled(readScrollTop(scroller) > threshold)
    }
    onScroll()
    return subscribeScroll(scroller, onScroll)
  }, [threshold])

  return { scrolled, hostRef }
}

const ROOM_PATH = /^\/r\/([^/]+)(\/.*)?$/

/**
 * One level up: a room's home goes back to the app's main screen, any page
 * inside a room goes back to that room's home.
 */
function BackLink() {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const match = ROOM_PATH.exec(pathname)
  const code = match?.[1]
  const inner = match?.[2] && match[2] !== "/"
  const className =
    "icon-hit -ml-2.5 size-11 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
  const icon = <HugeiconsIcon icon={ArrowLeft01Icon} size={22} strokeWidth={2} />

  if (code && inner) {
    return (
      <Link
        to="/r/$code"
        params={{ code: decodeURIComponent(code) }}
        aria-label="Back"
        className={className}
      >
        {icon}
      </Link>
    )
  }
  return (
    <Link
      to="/"
      search={{ stay: true }}
      aria-label="Back to all your rooms"
      className={className}
    >
      {icon}
    </Link>
  )
}

/** Sticky room chrome: back on the left; the room's actions and the account on the right. */
export function AppHeader({
  right,
  className,
}: {
  right?: ReactNode
  className?: string
}) {
  const { scrolled, hostRef } = useScrolled(SCROLL_THRESHOLD)

  return (
    <header
      ref={hostRef}
      className={cn(
        "sticky top-0 z-30 shrink-0 border-b border-transparent transition-colors duration-200",
        scrolled && "border-foreground/10 bg-background/80 backdrop-blur-xl",
        className
      )}
    >
      <div className="page-gutter mx-auto flex h-12 max-w-content items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1">
          <BackLink />
          <SiteLogo className="text-[15px]" />
        </div>
        <div className="flex items-center gap-2">
          {right}
          <AuthControls />
        </div>
      </div>
    </header>
  )
}
