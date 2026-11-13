import { addMonths, formatDay, stayOverlapsMonth } from "@/lib/house-month"
import type {
  RecurringOccurrenceDto,
  RecurringTemplateDto,
} from "@/lib/house-types"
import {
  computeNetsWithSettlements,
  formatMoney,
  simplifyTransfers,
} from "@/lib/settle"
import type { BalanceLine, Transfer } from "@/lib/settle"

export type HouseLedgerMember = {
  id: string
  name: string
  isGuest?: boolean
  joinedOn?: string | null
  leftOn?: string | null
}

export type HouseLedgerExpense = {
  paidById: string
  periodMonth: string | null
  createdAt?: string
  isPersonal?: boolean
  shares: Array<{ memberId: string; amountCents: number }>
}

export type HouseLedgerSettlement = {
  fromMemberId: string
  toMemberId: string
  amountCents: number
  createdAt: string
}

export type MonthBreakdownRow = {
  periodMonth: string
  yourShareCents: number
  youPaidCents: number
  paymentsCents: number
  monthNetCents: number
  runningCents: number
}

export type DueThisMonthItem = {
  templateId: string
  title: string
  category: string
  kind: "FIXED" | "VARIABLE"
  amountCents: number | null
  periodMonth: string
  dueDay: number
  paidById: string
  splitMode: string
}

/** Housemates whose stay touches the period month. Guests stay out unless added by hand. */
export function defaultParticipants<T extends HouseLedgerMember>(
  members: T[],
  periodMonth: string
): T[] {
  return members.filter(
    (member) =>
      !member.isGuest &&
      stayOverlapsMonth(
        { joinedOn: member.joinedOn ?? null, leftOn: member.leftOn ?? null },
        periodMonth
      )
  )
}

export function memberHasHouseLedger(
  memberId: string,
  input: {
    expenses: Array<{
      paidById: string
      shares: Array<{ memberId: string }>
    }>
    settlements: Array<{ fromMemberId: string; toMemberId: string }>
    templates?: Array<{
      paidById: string
      shares: Array<{ memberId: string }>
    }>
  }
): boolean {
  if (
    input.expenses.some(
      (expense) =>
        expense.paidById === memberId ||
        expense.shares.some((share) => share.memberId === memberId)
    )
  ) {
    return true
  }
  if (
    input.settlements.some(
      (settlement) =>
        settlement.fromMemberId === memberId ||
        settlement.toMemberId === memberId
    )
  ) {
    return true
  }
  if (
    input.templates?.some(
      (template) =>
        template.paidById === memberId ||
        template.shares.some((share) => share.memberId === memberId)
    )
  ) {
    return true
  }
  return false
}

export function houseNets(
  members: Array<{ id: string; name: string }>,
  expenses: HouseLedgerExpense[],
  settlements: HouseLedgerSettlement[]
): BalanceLine[] {
  return computeNetsWithSettlements(
    members,
    expenses
      .filter((expense) => !expense.isPersonal)
      .map((expense) => ({
        paidById: expense.paidById,
        shares: expense.shares.map((share) => ({
          memberId: share.memberId,
          amountCents: share.amountCents,
        })),
      })),
    settlements.map((settlement) => ({
      fromMemberId: settlement.fromMemberId,
      toMemberId: settlement.toMemberId,
      amountCents: settlement.amountCents,
    }))
  )
}

export function houseTransfers(
  members: Array<{ id: string; name: string }>,
  expenses: HouseLedgerExpense[],
  settlements: HouseLedgerSettlement[]
): Transfer[] {
  return simplifyTransfers(houseNets(members, expenses, settlements))
}

export function houseBalanceCopy(
  name: string,
  netCents: number,
  currency: string
): string {
  if (netCents < 0) return `${name} owes ${formatMoney(-netCents, currency)}`
  if (netCents > 0) {
    return `${name} gets back ${formatMoney(netCents, currency)}`
  }
  return `${name} is square`
}

export function viewerHeroCopy(
  netCents: number,
  currency: string,
  options: { guestWithoutCharges?: boolean } = {}
): string {
  if (options.guestWithoutCharges) return "You're not on any charges"
  if (netCents < 0) return `You owe ${formatMoney(-netCents, currency)}`
  if (netCents > 0) return `You get back ${formatMoney(netCents, currency)}`
  return "You're square"
}

export function formatHouseTransfer(
  transfer: Transfer,
  currency: string
): string {
  return `${transfer.fromName} pays ${transfer.toName} ${formatMoney(transfer.amountCents, currency)}`
}

function monthOfIso(value: string): string {
  return value.slice(0, 7)
}

export function monthBreakdown(
  memberId: string,
  expenses: HouseLedgerExpense[],
  settlements: HouseLedgerSettlement[]
): MonthBreakdownRow[] {
  const months = new Map<
    string,
    { yourShareCents: number; youPaidCents: number; paymentsCents: number }
  >()

  function bucket(key: string) {
    const existing = months.get(key)
    if (existing) return existing
    const next = { yourShareCents: 0, youPaidCents: 0, paymentsCents: 0 }
    months.set(key, next)
    return next
  }

  for (const expense of expenses) {
    if (expense.isPersonal) continue
    const key = expense.periodMonth ?? monthOfIso(expense.createdAt ?? "")
    if (!/^\d{4}-\d{2}$/.test(key)) continue
    const row = bucket(key)
    const share = expense.shares.find((item) => item.memberId === memberId)
    if (share) row.yourShareCents += share.amountCents
    if (expense.paidById === memberId) {
      row.youPaidCents += expense.shares.reduce(
        (sum, item) => sum + item.amountCents,
        0
      )
    }
  }

  for (const settlement of settlements) {
    const key = monthOfIso(settlement.createdAt)
    if (!/^\d{4}-\d{2}$/.test(key)) continue
    if (
      settlement.fromMemberId !== memberId &&
      settlement.toMemberId !== memberId
    ) {
      continue
    }
    const row = bucket(key)
    if (settlement.fromMemberId === memberId) {
      row.paymentsCents += settlement.amountCents
    } else {
      row.paymentsCents -= settlement.amountCents
    }
  }

  const keys = [...months.keys()].sort()
  let running = 0
  const rows: MonthBreakdownRow[] = keys.map((periodMonth) => {
    const row = months.get(periodMonth)!
    const monthNetCents =
      row.youPaidCents - row.yourShareCents + row.paymentsCents
    running += monthNetCents
    return {
      periodMonth,
      yourShareCents: row.yourShareCents,
      youPaidCents: row.youPaidCents,
      paymentsCents: row.paymentsCents,
      monthNetCents,
      runningCents: running,
    }
  })
  return rows.reverse()
}

export function dueThisMonth(
  templates: RecurringTemplateDto[],
  occurrences: RecurringOccurrenceDto[],
  nowMonth: string
): DueThisMonthItem[] {
  const handled = new Set(
    occurrences.map((row) => `${row.templateId}:${row.periodMonth}`)
  )
  const windowStart = addMonths(nowMonth, -2)
  const items: DueThisMonthItem[] = []

  for (const template of templates) {
    if (template.archivedAt) continue
    if (template.startMonth > nowMonth) continue
    let cursor =
      template.startMonth > windowStart ? template.startMonth : windowStart
    while (cursor <= nowMonth) {
      if (!handled.has(`${template.id}:${cursor}`)) {
        items.push({
          templateId: template.id,
          title: template.title,
          category: template.category,
          kind: template.kind,
          amountCents: template.amountCents,
          periodMonth: cursor,
          dueDay: template.dueDay,
          paidById: template.paidById,
          splitMode: template.splitMode,
        })
      }
      cursor = addMonths(cursor, 1)
    }
  }

  items.sort((a, b) => {
    if (a.periodMonth !== b.periodMonth) {
      return a.periodMonth.localeCompare(b.periodMonth)
    }
    if (a.dueDay !== b.dueDay) return a.dueDay - b.dueDay
    return a.title.localeCompare(b.title)
  })
  return items
}

export function houseMemberOnCharges(
  memberId: string,
  expenses: Array<{ shares: Array<{ memberId: string }> }>
): boolean {
  return expenses.some((expense) =>
    expense.shares.some((share) => share.memberId === memberId)
  )
}

export function movedOutSubtitle(leftOn: string | null): string | null {
  if (!leftOn) return null
  return `Moved out ${formatDay(leftOn)}`
}
