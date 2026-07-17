import { centsToAtmDigits, atmDigitsToCents } from "@/lib/atm-amount"
import { equalSplitCents } from "@/lib/settle"

export type RedistributeAmountsArgs = {
  totalCents: number
  includedIds: string[]
  manualIds: ReadonlySet<string>
  /** Existing ATM digit buffers; manuals are preserved from here. */
  amounts: Record<string, string>
  fractionDigits: number
}

/**
 * Keep manual member amounts; split remaining cents equally among unlocked
 * included members. Unlocked buffers are overwritten. If manuals exceed total,
 * unlocked get 0.
 */
export function redistributeAmounts({
  totalCents,
  includedIds,
  manualIds,
  amounts,
  fractionDigits,
}: RedistributeAmountsArgs): Record<string, string> {
  const next: Record<string, string> = {}
  const included = includedIds.filter(Boolean)

  let manualSum = 0
  for (const id of included) {
    if (!manualIds.has(id)) continue
    const digits = amounts[id] ?? ""
    next[id] = digits
    manualSum += atmDigitsToCents(digits, fractionDigits)
  }

  const unlocked = included.filter((id) => !manualIds.has(id))
  if (unlocked.length === 0) {
    return next
  }

  const remaining = Math.max(0, totalCents - manualSum)
  if (remaining === 0 || totalCents <= 0) {
    for (const id of unlocked) {
      next[id] = ""
    }
    return next
  }

  const shares = equalSplitCents(remaining, unlocked)
  for (const share of shares) {
    next[share.memberId] = centsToAtmDigits(
      share.amountCents,
      fractionDigits
    )
  }
  return next
}
