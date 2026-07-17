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

export type SettlementLedgerEntry = {
  fromMemberId: string
  toMemberId: string
  amountCents: number
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

export function computeNetsWithSettlements(
  members: Array<{ id: string; name: string }>,
  expenses: LedgerEntry[],
  settlements: SettlementLedgerEntry[]
): BalanceLine[] {
  return computeNets(members, [
    ...expenses,
    ...settlements.map((settlement) => ({
      paidById: settlement.fromMemberId,
      shares: [
        {
          memberId: settlement.toMemberId,
          amountCents: settlement.amountCents,
        },
      ],
    })),
  ])
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

export function buildTripSummary(input: {
  name: string
  code: string
  currency: string
  expenses: Array<{
    title: string
    amountCents: number
    currency: string
    paidByName: string
    category?: string | null
    isPersonal?: boolean
  }>
  settlements: Array<{
    fromMemberName: string
    toMemberName: string
    amountCents: number
    currency: string
  }>
  transfers: Transfer[]
}): string {
  const lines = [
    `${input.name} (${input.code})`,
    `Base currency: ${input.currency}`,
    "",
    "Expenses:",
  ]

  if (input.expenses.length === 0) {
    lines.push("- None")
  } else {
    for (const expense of input.expenses) {
      const category = expense.category ? ` [${expense.category}]` : ""
      const personal = expense.isPersonal ? " (personal)" : ""
      lines.push(
        `- ${expense.title}${category}${personal}: ${formatMoney(
          expense.amountCents,
          expense.currency
        )} paid by ${expense.paidByName}`
      )
    }
  }

  lines.push("", "Recorded payments:")
  if (input.settlements.length === 0) {
    lines.push("- None")
  } else {
    for (const settlement of input.settlements) {
      lines.push(
        `- ${settlement.fromMemberName} paid ${settlement.toMemberName} ${formatMoney(
          settlement.amountCents,
          settlement.currency
        )}`
      )
    }
  }

  lines.push("", "Remaining transfers:")
  if (input.transfers.length === 0) {
    lines.push("- All settled")
  } else {
    for (const transfer of input.transfers) {
      lines.push(`- ${formatTransferSentence(transfer, input.currency)}`)
    }
  }

  return lines.join("\n")
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
  const cleaned = raw.trim().replace(/[^0-9.,]/g, "")
  if (!cleaned) return null

  const separators = [...cleaned.matchAll(/[.,]/g)]
  let normalized = cleaned

  if (separators.length === 1) {
    const separator = separators[0]
    const digitsAfter = cleaned.length - separator.index - 1
    normalized =
      digitsAfter === 1 || digitsAfter === 2
        ? cleaned.replace(separator[0], ".")
        : cleaned.replace(/[.,]/g, "")
  } else if (separators.length > 1) {
    const last = separators[separators.length - 1]
    const digitsAfter = cleaned.length - last.index - 1
    if (digitsAfter === 1 || digitsAfter === 2) {
      normalized = `${cleaned.slice(0, last.index).replace(/[.,]/g, "")}.${cleaned.slice(last.index + 1)}`
    } else {
      normalized = cleaned.replace(/[.,]/g, "")
    }
  }

  const value = Number.parseFloat(normalized)
  if (!Number.isFinite(value) || value < 0) return null
  return Math.round(value * 100)
}

/**
 * Split total cents by integer weights using the largest-remainder method so
 * the parts always sum exactly to the total. Members with weight 0 are excluded.
 * Example: total split by [2,1,1,0] → [50%, 25%, 25%, 0].
 */
export function partsSplitCents(
  totalCents: number,
  weights: Array<{ memberId: string; weight: number }>
): Array<{ memberId: string; amountCents: number; weight: number }> {
  if (totalCents < 0) {
    throw new Error("Amount cannot be negative")
  }
  const active = weights.filter((entry) => entry.weight > 0)
  const totalWeight = active.reduce((sum, entry) => sum + entry.weight, 0)
  if (totalWeight <= 0) {
    throw new Error("At least one member needs a positive number of parts")
  }

  const raw = active.map((entry) => {
    const exact = (totalCents * entry.weight) / totalWeight
    const base = Math.floor(exact)
    return {
      memberId: entry.memberId,
      weight: entry.weight,
      base,
      remainder: exact - base,
    }
  })

  const distributed = raw.reduce((sum, entry) => sum + entry.base, 0)
  let leftover = totalCents - distributed
  const byRemainder = [...raw].sort((a, b) => b.remainder - a.remainder)
  for (const entry of byRemainder) {
    if (leftover <= 0) break
    entry.base += 1
    leftover -= 1
  }

  const amountByMember = new Map(
    raw.map((entry) => [entry.memberId, entry.base])
  )
  return active.map((entry) => ({
    memberId: entry.memberId,
    weight: entry.weight,
    amountCents: amountByMember.get(entry.memberId) ?? 0,
  }))
}

export type FxRates = Record<string, number> | null | undefined

/**
 * Convert an amount in `currency` to the room base currency.
 * fxRates are units of the currency per 1 unit of base (e.g. { CRC: 505 }).
 * Unknown or missing rates fall back to 1:1 so balances still compute.
 */
export function convertToBase(
  amountCents: number,
  currency: string | null | undefined,
  baseCurrency: string,
  fxRates: FxRates
): number {
  if (!currency || currency === baseCurrency) return amountCents
  const rate = fxRates?.[currency]
  if (!rate || rate <= 0) return amountCents
  return Math.round(amountCents / rate)
}
