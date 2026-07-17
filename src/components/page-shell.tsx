import type { ReactNode } from "react"

import { SplitAtmosphere } from "@/components/split-atmosphere"
import { cn } from "@/lib/utils"

type PageShellProps = {
  children: ReactNode
  /** Use `main` for standalone pages; `div` when nested under another landmark. */
  as?: "div" | "main"
  /** Narrow (landing) vs content (room) max width. */
  width?: "narrow" | "content"
  className?: string
  /** Extra classes on the inner padded column. */
  innerClassName?: string
  /** Atmosphere stipple opacity class. */
  stippleClassName?: string
  /** Skip atmosphere shell (plain gutter column). */
  plain?: boolean
}

/**
 * Shared page column: optional flat atmosphere + gutter + max-width + safe padding.
 */
export function PageShell({
  children,
  as = "main",
  width = "content",
  className,
  innerClassName,
  stippleClassName,
  plain = false,
}: PageShellProps) {
  const column = (
    <div
      className={cn(
        "page-gutter relative mx-auto w-full",
        width === "narrow" ? "max-w-narrow" : "max-w-content",
        innerClassName
      )}
    >
      {children}
    </div>
  )

  if (plain) {
    const Comp = as
    return <Comp className={cn("min-h-dvh", className)}>{column}</Comp>
  }

  return (
    <SplitAtmosphere
      as={as}
      className={className}
      stippleClassName={stippleClassName}
    >
      {column}
    </SplitAtmosphere>
  )
}
