import { HOUSE_ROW_SIGN_IN, houseRowBalanceCopy } from "@/lib/house-ledger"
import { cn } from "@/lib/utils"

export function HouseRowBalance({
  balanceCents,
  currency,
}: {
  balanceCents: number | null | undefined
  currency?: string
}) {
  const needsSignIn = balanceCents == null || !currency
  const label = needsSignIn
    ? HOUSE_ROW_SIGN_IN
    : houseRowBalanceCopy(balanceCents, currency)
  const muted = needsSignIn || balanceCents === 0
  return (
    <span
      className={cn(
        "max-w-[9.75rem] shrink-0 self-center text-right text-[13px] leading-snug tabular-nums",
        muted ? "text-muted-foreground" : "text-foreground"
      )}
    >
      {label}
    </span>
  )
}
