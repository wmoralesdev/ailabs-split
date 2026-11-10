import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/**
 * Product name with quantity as a separate count, never `8 × Name`.
 * Quantity 1 is the name only. Optional children sit under the name, not the count.
 */
export function LineQtyName({
  name,
  quantity,
  className,
  nameClassName,
  children,
}: {
  name: string
  quantity: number
  className?: string
  nameClassName?: string
  children?: ReactNode
}) {
  const count = Math.round(quantity)
  const showQty = count > 1

  return (
    <span className={cn("flex min-w-0 items-start gap-2.5", className)}>
      <span
        className="line-qty pt-0.5"
        aria-hidden={showQty ? undefined : true}
        aria-label={showQty ? `Qty ${count}` : undefined}
      >
        {showQty ? count : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block", nameClassName)}>{name}</span>
        {children}
      </span>
    </span>
  )
}
