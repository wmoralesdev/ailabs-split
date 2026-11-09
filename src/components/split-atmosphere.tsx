import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

type SplitAtmosphereProps = {
  /** Wrapper element; defaults to `div`. Use `main` for standalone pages. */
  as?: "div" | "main"
  children: ReactNode
  className?: string
}

/** Paper ground with a halftone wash that fades out over the top half. */
export function SplitAtmosphere({
  as: Comp = "div",
  children,
  className,
}: SplitAtmosphereProps) {
  return (
    <Comp className={cn("relative isolate min-h-dvh bg-background", className)}>
      <div aria-hidden className="halftone-wash" />
      {children}
    </Comp>
  )
}
