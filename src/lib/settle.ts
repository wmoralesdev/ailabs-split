export type BalanceLine = {
  memberId: string
  name: string
  netCents: number
}

export type Transfer = {
  fromId: string
  fromName: string
  toId: string
  toName: string
  amountCents: number
}

export type LedgerEntry = {
  paidById: string
  shares: Array<{ memberId: string; amountCents: number }>
}

/**
 * Net balance per member in integer cents.
 * Positive = others owe them; negative = they owe others.
 */
export function computeNets(
  members: Array<{ id: string; name: string }>,
  expenses: LedgerEntry[]
): BalanceLine[] {
  const nets = new Map<string, number>()
  const names = new Map<string, string>()

  for (const member of members) {
    nets.set(member.id, 0)
    names.set(member.id, member.name)
  }

  for (const expense of expenses) {
    let shareTotal = 0
    for (const share of expense.shares) {
      shareTotal += share.amountCents
      const current = nets.get(share.memberId)
      if (current === undefined) {
        throw new Error(`Unknown member in share: ${share.memberId}`)
      }
      nets.set(share.memberId, current - share.amountCents)
    }

    const afterShares = nets.get(expense.paidById)
    if (afterShares === undefined) {
      throw new Error(`Unknown payer: ${expense.paidById}`)
    }
    nets.set(expense.paidById, afterShares + shareTotal)
  }

  return members.map((member) => ({
    memberId: member.id,
    name: names.get(member.id) ?? member.name,
    netCents: nets.get(member.id) ?? 0,
  }))
}

/**
 * Greedy settle: match largest debtor to largest creditor until cleared.
 * Tricount-style minimized transfer list (not globally optimal, but simple).
 */
export function simplifyTransfers(balances: BalanceLine[]): Transfer[] {
  const debtors = balances
    .filter((b) => b.netCents < 0)
    .map((b) => ({
      id: b.memberId,
      name: b.name,
      amount: -b.netCents,
    }))
    .sort((a, b) => b.amount - a.amount)

  const creditors = balances
    .filter((b) => b.netCents > 0)
    .map((b) => ({
      id: b.memberId,
      name: b.name,
      amount: b.netCents,
    }))
    .sort((a, b) => b.amount - a.amount)

  const transfers: Transfer[] = []
  let i = 0
  let j = 0

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i]
    const creditor = creditors[j]

    const amount = Math.min(debtor.amount, creditor.amount)
    if (amount > 0) {
      transfers.push({
        fromId: debtor.id,
        fromName: debtor.name,
        toId: creditor.id,
        toName: creditor.name,
        amountCents: amount,
      })
    }

    debtor.amount -= amount
    creditor.amount -= amount

    if (debtor.amount === 0) i += 1
    if (creditor.amount === 0) j += 1
  }

  return transfers
}

export function formatTransferSentence(
  transfer: Transfer,
  currency: string
): string {
  const amount = formatMoney(transfer.amountCents, currency)
  return `${transfer.fromName} owes ${transfer.toName} ${amount}`
}

export function formatMoney(cents: number, currency: string): string {
  const value = cents / 100
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)
  } catch {
    return `${value.toFixed(2)} ${currency}`
  }
}

/** Split total cents equally; remainder cents go to the first members. */
export function equalSplitCents(
  totalCents: number,
  memberIds: string[]
): Array<{ memberId: string; amountCents: number }> {
  if (memberIds.length === 0) {
    throw new Error("At least one member is required for a split")
  }
  if (totalCents < 0) {
    throw new Error("Amount cannot be negative")
  }

  const base = Math.floor(totalCents / memberIds.length)
  let remainder = totalCents - base * memberIds.length

  return memberIds.map((memberId) => {
    const extra = remainder > 0 ? 1 : 0
    if (remainder > 0) remainder -= 1
    return { memberId, amountCents: base + extra }
  })
}

export function parseAmountToCents(raw: string): number | null {
  const cleaned = raw.trim().replace(/[^0-9.,]/g, "").replace(",", ".")
  if (!cleaned) return null
  const value = Number.parseFloat(cleaned)
  if (!Number.isFinite(value) || value < 0) return null
  return Math.round(value * 100)
}
