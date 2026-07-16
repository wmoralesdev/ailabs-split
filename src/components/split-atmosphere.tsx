import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

type SplitAtmosphereProps = {
  /** Wrapper element; defaults to `div`. Use `main` for standalone pages. */
  as?: "div" | "main"
  children: ReactNode
  className?: string
  /** Stipple opacity — landing uses 40, quieter surfaces use 30. */
  stippleClassName?: string
}

/**
 * Shared landing-style wash + stipple shell.
 * Put interactive content in a `relative` child so it sits above the stipple.
 */
export function SplitAtmosphere({
  as: Comp = "div",
  children,
  className,
  stippleClassName = "opacity-40",
}: SplitAtmosphereProps) {
  return (
    <Comp className={cn("split-hero-wash relative min-h-dvh", className)}>
      <div
        aria-hidden
        className={cn(
          "split-stipple pointer-events-none absolute inset-0",
          stippleClassName
        )}
      />
      {children}
    </Comp>
  )
}
