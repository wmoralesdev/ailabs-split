import type { ReactNode } from "react"
import { useEffect, useState } from "react"
import { Link } from "@tanstack/react-router"

import { SiteLogo } from "@/components/site-logo"
import { ThemeToggle } from "@/components/theme-toggle"
import { cn } from "@/lib/utils"

const SCROLL_THRESHOLD = 12

/** Whether the window has been scrolled past the header's frosted-glass threshold. */
function useScrolled(threshold: number): boolean {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > threshold)
    }
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [threshold])

  return scrolled
}

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
  const scrolled = useScrolled(SCROLL_THRESHOLD)

  return (
    <header
      className={cn(
        "sticky top-0 z-30 border-b border-transparent transition-colors duration-200",
        scrolled &&
          "border-foreground/5 bg-background/70 backdrop-blur-xl supports-backdrop-filter:bg-background/40",
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
