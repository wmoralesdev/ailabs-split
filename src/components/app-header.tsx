import type { ReactNode } from "react"
import { Link } from "@tanstack/react-router"

import { SiteLogo } from "@/components/site-logo"
import { ThemeToggle } from "@/components/theme-toggle"
import { cn } from "@/lib/utils"

/** Sticky top chrome: brand mark on the left, theme toggle + optional slot on the right. */
export function AppHeader({
  right,
  className,
  showWordmark = true,
}: {
  right?: ReactNode
  className?: string
  showWordmark?: boolean
}) {
  return (
    <header
      className={cn(
        "border-border/60 bg-background sticky top-0 z-30 border-b",
        className
      )}
    >
      <div className="page-gutter mx-auto flex h-14 max-w-content items-center justify-between gap-3">
        <Link to="/" search={{ stay: true }} className="rounded-md" aria-label="Split home">
          <SiteLogo showWordmark={showWordmark} />
        </Link>
        <div className="flex items-center gap-1">
          {right}
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
