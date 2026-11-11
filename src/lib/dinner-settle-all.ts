import { dinnerBill } from "@/lib/dinner-bill"
import {
  computeNetsWithSettlements,
  formatMoney,
  simplifyTransfers,
} from "@/lib/settle"
import type { Transfer } from "@/lib/settle"
import type { RoomDto } from "@/server/rooms"

export type DinnerSettleLine = {
  code: string
  name: string
  currency: string
  memberId: string
  oweCents: number
  owedCents: number
  payees: string[]
  payers: string[]
  outgoing: Transfer[]
  incoming: Transfer[]
}

export type CurrencyBucket = {
  currency: string
  oweCents: number
  owedCents: number
}

export type SettleAllCard = {
  dinnerCount: number
  buckets: CurrencyBucket[]
  payeeNames: string[]
  payerNames: string[]
  lines: DinnerSettleLine[]
}

const HIDDEN_KEY = "split:hidden-rooms"

function normalizeCode(code: string): string {
  return code.trim().toUpperCase()
}

function uniqueNames(names: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const name of names) {
    const trimmed = name.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    out.push(trimmed)
  }
  return out
}

/** "Walter", "Walter and Ana", "Walter, Ana, and Ben". */
export function joinPersonNames(names: readonly string[]): string {
  const unique = uniqueNames(names)
  if (unique.length === 0) return ""
  if (unique.length === 1) return unique[0] ?? ""
  if (unique.length === 2) return `${unique[0]} and ${unique[1]}`
  return `${unique.slice(0, -1).join(", ")} and ${unique[unique.length - 1]}`
}

/**
 * Guest hide from PR #37 (`split:hidden-rooms`). Signed-in hides are merged
 * into that key on home; this reader is the source of truth on the device.
 */
export function readHiddenDinnerCodes(extra: readonly string[] = []): string[] {
  const fromExtra = extra.map(normalizeCode).filter(Boolean)
  if (typeof window === "undefined") {
    return Array.from(new Set(fromExtra))
  }
  try {
    const raw = window.localStorage.getItem(HIDDEN_KEY)
    if (!raw) return Array.from(new Set(fromExtra))
    const parsed: unknown = JSON.parse(raw)
    const stored = Array.isArray(parsed)
      ? parsed
          .filter((value): value is string => typeof value === "string")
          .map(normalizeCode)
          .filter(Boolean)
      : []
    return Array.from(new Set([...fromExtra, ...stored]))
  } catch {
    return Array.from(new Set(fromExtra))
  }
}

/** Recent dinners plus Yours, minus trips, drafts later, and hidden rooms. */
export function candidateDinnerCodes(input: {
  recent: ReadonlyArray<{ code: string; kind?: string }>
  yours: ReadonlyArray<{ code: string; kind: string }>
  hidden: readonly string[]
}): string[] {
  const hidden = new Set(input.hidden.map(normalizeCode).filter(Boolean))
  const out: string[] = []
  const seen = new Set<string>()
  for (const row of [...input.recent, ...input.yours]) {
    if (row.kind !== "DINNER") continue
    const code = normalizeCode(row.code)
    if (!code || seen.has(code) || hidden.has(code)) continue
    seen.add(code)
    out.push(code)
  }
  return out
}

export function dinnerTransfers(
  room: Pick<RoomDto, "members" | "expenses" | "settlements">
): Transfer[] {
  const nets = computeNetsWithSettlements(
    room.members,
    room.expenses
      .filter((expense) => !expense.isPersonal)
      .map((expense) => ({
        paidById: expense.paidById,
        shares: expense.shares.map((share) => ({
          memberId: share.memberId,
          amountCents: share.amountCents,
        })),
      })),
    room.settlements.map((settlement) => ({
      fromMemberId: settlement.fromMemberId,
      toMemberId: settlement.toMemberId,
      amountCents: settlement.amountCents,
    }))
  )
  return simplifyTransfers(nets)
}

export function dinnerSettleLine(
  room: RoomDto,
  memberId: string
): DinnerSettleLine | null {
  if (room.kind !== "DINNER") return null
  if (!room.members.some((member) => member.id === memberId)) return null
  const bill = dinnerBill(room.checks)
  if (!bill || bill.status !== "CONFIRMED") return null

  const mine = dinnerTransfers(room).filter(
    (transfer) => transfer.fromId === memberId || transfer.toId === memberId
  )
  const outgoing = mine.filter((transfer) => transfer.fromId === memberId)
  const incoming = mine.filter((transfer) => transfer.toId === memberId)
  const oweCents = outgoing.reduce(
    (sum, transfer) => sum + transfer.amountCents,
    0
  )
  const owedCents = incoming.reduce(
    (sum, transfer) => sum + transfer.amountCents,
    0
  )
  if (oweCents <= 0 && owedCents <= 0) return null

  return {
    code: room.code,
    name: room.name,
    currency: room.currency,
    memberId,
    oweCents,
    owedCents,
    payees: uniqueNames(outgoing.map((transfer) => transfer.toName)),
    payers: uniqueNames(incoming.map((transfer) => transfer.fromName)),
    outgoing,
    incoming,
  }
}

export function buildSettleAllCard(
  lines: readonly DinnerSettleLine[]
): SettleAllCard | null {
  if (lines.length < 2) return null

  const bucketOrder: string[] = []
  const byCurrency = new Map<string, CurrencyBucket>()
  for (const line of lines) {
    let bucket = byCurrency.get(line.currency)
    if (!bucket) {
      bucket = { currency: line.currency, oweCents: 0, owedCents: 0 }
      byCurrency.set(line.currency, bucket)
      bucketOrder.push(line.currency)
    }
    bucket.oweCents += line.oweCents
    bucket.owedCents += line.owedCents
  }

  return {
    dinnerCount: lines.length,
    buckets: bucketOrder.map((currency) => byCurrency.get(currency)!),
    payeeNames: uniqueNames(lines.flatMap((line) => line.payees)),
    payerNames: uniqueNames(lines.flatMap((line) => line.payers)),
    lines: [...lines],
  }
}

function amountWithCode(
  cents: number,
  currency: string,
  showCode: boolean
): string {
  const formatted = formatMoney(cents, currency)
  if (!showCode) return formatted
  if (formatted.includes(currency)) return formatted
  return `${formatted} ${currency}`
}

/** One line per currency (and per owe vs get-back). Never nets or FX-merges. */
export function formatSettleHeadlines(card: SettleAllCard): string[] {
  const showCode = card.buckets.length > 1
  const headlines: string[] = []
  for (const bucket of card.buckets) {
    if (bucket.oweCents > 0) {
      headlines.push(
        `You owe ${amountWithCode(bucket.oweCents, bucket.currency, showCode)}`
      )
    }
    if (bucket.owedCents > 0) {
      headlines.push(
        `You get back ${amountWithCode(bucket.owedCents, bucket.currency, showCode)}`
      )
    }
  }
  return headlines
}

export function formatSettleDetail(card: SettleAllCard): string {
  const dinners = `${card.dinnerCount} ${card.dinnerCount === 1 ? "dinner" : "dinners"}`
  if (card.payeeNames.length > 0) {
    return `${dinners} · Pay ${joinPersonNames(card.payeeNames)}`
  }
  if (card.payerNames.length > 0) {
    return `${dinners} · From ${joinPersonNames(card.payerNames)}`
  }
  return dinners
}

export function formatLineAmount(line: DinnerSettleLine): string {
  if (line.oweCents > 0) {
    return formatMoney(line.oweCents, line.currency)
  }
  return formatMoney(line.owedCents, line.currency)
}

export function formatLinePayHint(line: DinnerSettleLine): string {
  if (line.oweCents > 0 && line.payees.length > 0) {
    return `Pay ${joinPersonNames(line.payees)}`
  }
  if (line.payers.length > 0) {
    return `From ${joinPersonNames(line.payers)}`
  }
  return "Open settle"
}

export function outgoingSettleItems(lines: readonly DinnerSettleLine[]): Array<{
  code: string
  fromMemberId: string
  toMemberId: string
  amountCents: number
  currency: string
}> {
  return lines.flatMap((line) =>
    line.outgoing.map((transfer) => ({
      code: line.code,
      fromMemberId: transfer.fromId,
      toMemberId: transfer.toId,
      amountCents: transfer.amountCents,
      currency: line.currency,
    }))
  )
}

export function formatPayAllSummary(card: SettleAllCard): {
  sentence: string
  amountLabel: string
} | null {
  const items = outgoingSettleItems(card.lines)
  if (items.length === 0) return null
  const sentence =
    card.payeeNames.length > 0
      ? `You pay ${joinPersonNames(card.payeeNames)}`
      : `${card.dinnerCount} dinners`
  const showCode = card.buckets.length > 1
  const amounts = card.buckets
    .filter((bucket) => bucket.oweCents > 0)
    .map((bucket) => amountWithCode(bucket.oweCents, bucket.currency, showCode))
  return {
    sentence,
    amountLabel: amounts.join(" · "),
  }
}
