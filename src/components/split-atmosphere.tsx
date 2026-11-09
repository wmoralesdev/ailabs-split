import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

type SplitAtmosphereProps = {
  /** Wrapper element; defaults to `div`. Use `main` for standalone pages. */
  as?: "div" | "main"
  children: ReactNode
  className?: string
}

/**
 * Dotted paper shell (halftone screen on the brand ground).
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
