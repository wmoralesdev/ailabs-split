import { createServerFn } from "@tanstack/react-start"
import { getRequestHeader } from "@tanstack/react-start/server"
import type { ZodType } from "zod"

import { prisma } from "@/lib/prisma"
import { assertRateLimit } from "@/lib/rate-limit"
import { generateRoomCode } from "@/lib/room-code"
import {
  addExpenseSchema,
  claimMemberSchema,
  createRoomSchema,
  deleteExpenseSchema,
  deleteSettlementSchema,
  getRoomByCodeSchema,
  joinRoomSchema,
  recordSettlementSchema,
  updateExpenseSchema,
} from "@/lib/schemas"
import { equalSplitCents, partsSplitCents } from "@/lib/settle"

export type RoomMemberDto = {
  id: string
  name: string
}

export type ExpenseShareDto = {
  memberId: string
  memberName: string
  amountCents: number
  weight: number | null
}

export type ExpenseDto = {
  id: string
  title: string
  amountCents: number
  category: string | null
  currency: string
  splitMode: string
  isPersonal: boolean
  paidById: string
  paidByName: string
  createdAt: string
  shares: ExpenseShareDto[]
}

export type SettlementDto = {
  id: string
  fromMemberId: string
  fromMemberName: string
  toMemberId: string
  toMemberName: string
  amountCents: number
  currency: string
  createdAt: string
}

export type RoomDto = {
  id: string
  code: string
  name: string
  /** Base / settlement currency. */
  currency: string
  /** Allowed currencies for expenses (always includes the base currency). */
  currencies: string[]
  /** Units of each currency per 1 unit of the base currency. */
  fxRates: Record<string, number>
  createdAt: string
  members: RoomMemberDto[]
  expenses: ExpenseDto[]
  settlements: SettlementDto[]
}

/** Parse with Zod but surface the first friendly message instead of a ZodError blob. */
function parseOrThrow<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data)
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? "Invalid input")
  }
  return result.data
}

function toFxRates(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object") return {}
  const out: Record<string, number> = {}
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
      out[key] = raw
    }
  }
  return out
}

function clientIp(): string {
  const forwarded = getRequestHeader("x-forwarded-for")
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim()
    if (first) return first
  }
  return getRequestHeader("x-real-ip") ?? "unknown"
}

function limitWrites(action: string) {
  assertRateLimit(`write:ip:${clientIp()}:${action}`, {
    limit: 30,
    windowMs: 60_000,
    label: action,
  })
}

function expenseToDto(
  expense: {
    id: string
    title: string
    amountCents: number
    category: string | null
    currency: string | null
    splitMode: string
    isPersonal: boolean
    paidById: string
    paidBy: { name: string }
    createdAt: Date
    shares: Array<{
      memberId: string
      amountCents: number
      weight: number | null
      member: { name: string }
    }>
  },
  roomCurrency: string
): ExpenseDto {
  return {
    id: expense.id,
    title: expense.title,
    amountCents: expense.amountCents,
    category: expense.category,
    currency: expense.currency ?? roomCurrency,
    splitMode: expense.splitMode,
    isPersonal: expense.isPersonal,
    paidById: expense.paidById,
    paidByName: expense.paidBy.name,
    createdAt: expense.createdAt.toISOString(),
    shares: expense.shares.map((share) => ({
      memberId: share.memberId,
      memberName: share.member.name,
      amountCents: share.amountCents,
      weight: share.weight ?? null,
    })),
  }
}

function settlementToDto(settlement: {
  id: string
  fromMemberId: string
  fromMember: { name: string }
  toMemberId: string
  toMember: { name: string }
  amountCents: number
  currency: string
  createdAt: Date
}): SettlementDto {
  return {
    id: settlement.id,
    fromMemberId: settlement.fromMemberId,
    fromMemberName: settlement.fromMember.name,
    toMemberId: settlement.toMemberId,
    toMemberName: settlement.toMember.name,
    amountCents: settlement.amountCents,
    currency: settlement.currency,
    createdAt: settlement.createdAt.toISOString(),
  }
}

function buildExpenseShares(data: {
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

async function loadRoomByCode(
  code: string,
  viewerMemberId?: string | null
): Promise<RoomDto | null> {
  const room = await prisma.room.findUnique({
    where: { code },
    include: {
      members: { orderBy: { name: "asc" } },
      expenses: {
        orderBy: { createdAt: "desc" },
        include: {
          paidBy: true,
          shares: { include: { member: true } },
        },
      },
      settlements: {
        orderBy: { createdAt: "desc" },
        include: {
          fromMember: true,
          toMember: true,
        },
      },
    },
  })

  if (!room) return null

  const currencies =
    room.currencies.length > 0
      ? Array.from(new Set([room.currency, ...room.currencies]))
      : [room.currency]

  const visibleExpenses = room.expenses.filter(
    (expense) =>
      !expense.isPersonal ||
      (viewerMemberId != null && expense.paidById === viewerMemberId)
  )

  return {
    id: room.id,
    code: room.code,
    name: room.name,
    currency: room.currency,
    currencies,
    fxRates: toFxRates(room.fxRates),
    createdAt: room.createdAt.toISOString(),
    members: room.members.map((member) => ({
      id: member.id,
      name: member.name,
    })),
    expenses: visibleExpenses.map((expense) =>
      expenseToDto(expense, room.currency)
    ),
    settlements: room.settlements.map(settlementToDto),
  }
}

export const createRoom = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOrThrow(createRoomSchema, data))
  .handler(async ({ data }): Promise<RoomDto> => {
    limitWrites("create-room")
    const currencies = Array.from(new Set([data.currency, ...data.currencies]))
    const fxRates = data.fxRates ?? {}

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const code = generateRoomCode(7)
      try {
        const room = await prisma.room.create({
          data: {
            code,
            name: data.name,
            currency: data.currency,
            currencies,
            fxRates,
            members: {
              create: data.memberNames.map((memberName) => ({
                name: memberName,
              })),
            },
          },
        })
        const loaded = await loadRoomByCode(room.code)
        if (!loaded) throw new Error("Failed to load trip")
        return loaded
      } catch (error) {
        const isUnique =
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          (error as { code: string }).code === "P2002"
        if (!isUnique) throw error
      }
    }
    throw new Error("Could not allocate a trip code")
  })

export const getRoomByCode = createServerFn({ method: "GET" })
  .validator((data: unknown) => parseOrThrow(getRoomByCodeSchema, data))
  .handler(async ({ data }): Promise<RoomDto | null> => {
    return await loadRoomByCode(data.code, data.viewerMemberId)
  })

export const joinRoom = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOrThrow(joinRoomSchema, data))
  .handler(async ({ data }): Promise<{ room: RoomDto; memberId: string }> => {
    limitWrites("join-room")
    const existing = await loadRoomByCode(data.code)
    if (!existing) {
      throw new Error("Trip not found")
    }

    const match = existing.members.find(
      (member) => member.name.toLowerCase() === data.memberName.toLowerCase()
    )
    if (match) {
      const room = await loadRoomByCode(data.code, match.id)
      if (!room) throw new Error("Trip not found")
      return { room, memberId: match.id }
    }

    await prisma.member.create({
      data: {
        roomId: existing.id,
        name: data.memberName,
      },
    })

    const roomAnon = await loadRoomByCode(data.code)
    if (!roomAnon) throw new Error("Trip not found")
    const created = roomAnon.members.find(
      (member) => member.name.toLowerCase() === data.memberName.toLowerCase()
    )
    if (!created) throw new Error("Could not claim member")
    const room = await loadRoomByCode(data.code, created.id)
    if (!room) throw new Error("Trip not found")
    return { room, memberId: created.id }
  })

/** Pick an existing member id in a room (cross-device reclaim). */
export const claimMemberById = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOrThrow(claimMemberSchema, data))
  .handler(async ({ data }): Promise<{ memberId: string; name: string }> => {
    const room = await prisma.room.findUnique({
      where: { code: data.code },
      include: { members: true },
    })
    if (!room) throw new Error("Trip not found")
    const member = room.members.find((entry) => entry.id === data.memberId)
    if (!member) throw new Error("Member not found in this trip")
    return { memberId: member.id, name: member.name }
  })

export const addExpense = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOrThrow(addExpenseSchema, data))
  .handler(async ({ data }): Promise<ExpenseDto> => {
    limitWrites("add-expense")
    const room = await prisma.room.findUnique({
      where: { code: data.code },
      include: { members: true },
    })
    if (!room) throw new Error("Trip not found")

    const memberIds = new Set(room.members.map((member) => member.id))
    if (!memberIds.has(data.paidById)) {
      throw new Error("Payer is not in this trip")
    }
    for (const split of data.splits) {
      if (!memberIds.has(split.memberId)) {
        throw new Error("Share member is not in this trip")
      }
    }

    const allowedCurrencies =
      room.currencies.length > 0
        ? Array.from(new Set([room.currency, ...room.currencies]))
        : [room.currency]
    const currency =
      data.currency && allowedCurrencies.includes(data.currency)
        ? data.currency
        : (data.currency ?? room.currency)
    const { splitMode, shares } = buildExpenseShares(data)

    const expense = await prisma.expense.create({
      data: {
        roomId: room.id,
        title: data.title,
        amountCents: data.amountCents,
        category: data.category,
        currency,
        splitMode,
        isPersonal: data.isPersonal,
        paidById: data.paidById,
        shares: {
          create: shares.map((share) => ({
            memberId: share.memberId,
            amountCents: share.amountCents,
            weight: share.weight,
          })),
        },
      },
      include: {
        paidBy: true,
        shares: { include: { member: true } },
      },
    })

    return expenseToDto(expense, room.currency)
  })

export const updateExpense = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOrThrow(updateExpenseSchema, data))
  .handler(async ({ data }): Promise<ExpenseDto> => {
    limitWrites("update-expense")
    const room = await prisma.room.findUnique({
      where: { code: data.code },
      include: { members: true },
    })
    if (!room) throw new Error("Trip not found")

    const existing = await prisma.expense.findFirst({
      where: { id: data.expenseId, roomId: room.id },
      select: { id: true },
    })
    if (!existing) throw new Error("Expense not found")

    const memberIds = new Set(room.members.map((member) => member.id))
    if (!memberIds.has(data.paidById)) {
      throw new Error("Payer is not in this trip")
    }
    for (const split of data.splits) {
      if (!memberIds.has(split.memberId)) {
        throw new Error("Share member is not in this trip")
      }
    }

    const allowedCurrencies =
      room.currencies.length > 0
        ? Array.from(new Set([room.currency, ...room.currencies]))
        : [room.currency]
    const currency =
      data.currency && allowedCurrencies.includes(data.currency)
        ? data.currency
        : (data.currency ?? room.currency)
    const { splitMode, shares } = buildExpenseShares(data)

    const expense = await prisma.$transaction(async (tx) => {
      await tx.expenseShare.deleteMany({
        where: { expenseId: data.expenseId },
      })
      return await tx.expense.update({
        where: { id: data.expenseId },
        data: {
          title: data.title,
          amountCents: data.amountCents,
          category: data.category,
          currency,
          splitMode,
          isPersonal: data.isPersonal,
          paidById: data.paidById,
          shares: {
            create: shares.map((share) => ({
              memberId: share.memberId,
              amountCents: share.amountCents,
              weight: share.weight,
            })),
          },
        },
        include: {
          paidBy: true,
          shares: { include: { member: true } },
        },
      })
    })

    return expenseToDto(expense, room.currency)
  })

export const deleteExpense = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOrThrow(deleteExpenseSchema, data))
  .handler(async ({ data }): Promise<{ expenseId: string }> => {
    limitWrites("delete-expense")
    const room = await prisma.room.findUnique({
      where: { code: data.code },
      select: { id: true },
    })
    if (!room) throw new Error("Trip not found")

    const existing = await prisma.expense.findFirst({
      where: { id: data.expenseId, roomId: room.id },
      select: { id: true },
    })
    if (!existing) throw new Error("Expense not found")

    await prisma.expense.delete({ where: { id: data.expenseId } })
    return { expenseId: data.expenseId }
  })

export const recordSettlement = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOrThrow(recordSettlementSchema, data))
  .handler(async ({ data }): Promise<SettlementDto> => {
    limitWrites("record-settlement")
    const room = await prisma.room.findUnique({
      where: { code: data.code },
      include: { members: true },
    })
    if (!room) throw new Error("Trip not found")
    if (data.fromMemberId === data.toMemberId) {
      throw new Error("Settlement needs two different members")
    }

    const memberIds = new Set(room.members.map((member) => member.id))
    if (!memberIds.has(data.fromMemberId) || !memberIds.has(data.toMemberId)) {
      throw new Error("Settlement member is not in this trip")
    }

    const allowedCurrencies =
      room.currencies.length > 0
        ? Array.from(new Set([room.currency, ...room.currencies]))
        : [room.currency]
    const currency =
      data.currency && allowedCurrencies.includes(data.currency)
        ? data.currency
        : room.currency

    const settlement = await prisma.settlement.create({
      data: {
        roomId: room.id,
        fromMemberId: data.fromMemberId,
        toMemberId: data.toMemberId,
        amountCents: data.amountCents,
        currency,
      },
      include: {
        fromMember: true,
        toMember: true,
      },
    })

    return settlementToDto(settlement)
  })

export const deleteSettlement = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOrThrow(deleteSettlementSchema, data))
  .handler(async ({ data }): Promise<{ settlementId: string }> => {
    limitWrites("delete-settlement")
    const room = await prisma.room.findUnique({
      where: { code: data.code },
      select: { id: true },
    })
    if (!room) throw new Error("Trip not found")

    const existing = await prisma.settlement.findFirst({
      where: { id: data.settlementId, roomId: room.id },
      select: { id: true },
    })
    if (!existing) throw new Error("Settlement not found")

    await prisma.settlement.delete({ where: { id: data.settlementId } })
    return { settlementId: data.settlementId }
  })
