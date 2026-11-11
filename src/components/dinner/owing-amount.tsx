import { owingAmount } from "@/lib/dinner-labels"
import { cn } from "@/lib/utils"

/** Zero share is the word Nothing, never $0.00. */
export function OwingAmount({
  cents,
  currency,
  className,
}: {
  cents: number
  currency: string
  className?: string
}) {
  const owing = owingAmount(cents, currency)
  return (
    <span
      className={cn(
        owing.zero
          ? "text-[15px] font-normal text-muted-foreground"
          : "text-[15px] font-semibold tabular-nums",
        className
      )}
    >
      {owing.text}
    </span>
  )
}
