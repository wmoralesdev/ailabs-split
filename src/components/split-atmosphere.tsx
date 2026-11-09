import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

type SplitAtmosphereProps = {
  /** Wrapper element; defaults to `div`. Use `main` for standalone pages. */
  as?: "div" | "main"
  children: ReactNode
  className?: string
}

/** Flat paper ground shared by every screen. */
export function SplitAtmosphere({
  as: Comp = "div",
  children,
  className,
}: SplitAtmosphereProps) {
  return (
    <Comp className={cn("relative min-h-dvh bg-background", className)}>
      {children}
    </Comp>
  )
}
