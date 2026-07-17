import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

type SplitAtmosphereProps = {
  /** Wrapper element; defaults to `div`. Use `main` for standalone pages. */
  as?: "div" | "main"
  children: ReactNode
  className?: string
}

/**
 * Soft gradient background shell (top-down brand wash).
 * Put interactive content in a `relative` child when stacking layers.
 */
export function SplitAtmosphere({
  as: Comp = "div",
  children,
  className,
}: SplitAtmosphereProps) {
  return (
    <Comp className={cn("split-hero-wash relative min-h-dvh", className)}>
      {children}
    </Comp>
  )
}
