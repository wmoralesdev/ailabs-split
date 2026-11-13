import { equalSplitCents, partsSplitCents } from "@/lib/settle"

export function buildExpenseShares(data: {
  paidById: string
  amountCents: number
  splitMode: "EQUAL" | "PARTS" | "AMOUNT"
  isPersonal: boolean
  splits: Array<{ memberId: string; weight?: number; amountCents?: number }>
}): {
  splitMode: "EQUAL" | "PARTS" | "AMOUNT"
  shares: Array<{
    memberId: string
    amountCents: number
    weight: number | null
  }>
} {
  const isPersonal = data.isPersonal
  const splitMode = isPersonal ? "EQUAL" : data.splitMode

  if (isPersonal) {
    return {
      splitMode,
      shares: [
        {
          memberId: data.paidById,
          amountCents: data.amountCents,
          weight: null,
        },
      ],
    }
  }

  if (splitMode === "PARTS") {
    const parts = partsSplitCents(
      data.amountCents,
      data.splits.map((split) => ({
        memberId: split.memberId,
        weight: split.weight ?? 0,
      }))
    )
    return {
      splitMode,
      shares: parts.map((part) => ({
        memberId: part.memberId,
        amountCents: part.amountCents,
        weight: part.weight,
      })),
    }
  }

  if (splitMode === "AMOUNT") {
    const sum = data.splits.reduce(
      (total, split) => total + (split.amountCents ?? 0),
      0
    )
    if (sum !== data.amountCents) {
      throw new Error("Custom amounts must sum to the expense total")
    }
    return {
      splitMode,
      shares: data.splits.map((split) => ({
        memberId: split.memberId,
        amountCents: split.amountCents ?? 0,
        weight: null,
      })),
    }
  }

  return {
    splitMode,
    shares: equalSplitCents(
      data.amountCents,
      data.splits.map((split) => split.memberId)
    ).map((share) => ({ ...share, weight: null })),
  }
}
