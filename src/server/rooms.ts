import { createServerFn } from "@tanstack/react-start"
import { getRequestHeader } from "@tanstack/react-start/server"
import type { ZodType } from "zod"

import { prisma } from "@/lib/prisma"
import { assertRateLimit } from "@/lib/rate-limit"
import { generateRoomCode } from "@/lib/room-code"
import {
  addExpenseSchema,
  calibrateRoomFxSchema,
  claimMemberSchema,
  createRoomSchema,
  deleteExpenseSchema,
  deleteSettlementSchema,
  getRoomByCodeSchema,
  joinRoomSchema,
  recordSettlementSchema,
  reorderExpensesSchema,
  updateExpenseSchema,
} from "@/lib/schemas"
import {
  computeFxAdjustmentBps,
  equalSplitCents,
  partsSplitCents,
} from "@/lib/settle"
import type { FxCalibrationSample } from "@/lib/settle"

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
  /** True when this is someone else's personal expense (title/details hidden). */
  redacted: boolean
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
  /** Bank FX markup in basis points from calibration (87 = +0.87%). */
  fxAdjustmentBps: number
  /** Calibration samples used to derive fxAdjustmentBps. */
  fxCalibrationSamples: FxCalibrationSample[]
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

function toFxCalibrationSamples(value: unknown): FxCalibrationSample[] {
  if (!Array.isArray(value)) return []
  const samples: FxCalibrationSample[] = []
  for (const row of value) {
    if (!row || typeof row !== "object") continue
    const record = row as Record<string, unknown>
    const appCents = record.appCents
    const bankCents = record.bankCents
    if (
      typeof appCents !== "number" ||
      typeof bankCents !== "number" ||
      !Number.isInteger(appCents) ||
      !Number.isInteger(bankCents) ||
      appCents <= 0 ||
      bankCents <= 0
    ) {
      continue
    }
    const sample: FxCalibrationSample = { appCents, bankCents }
    if (typeof record.expenseId === "string" && record.expenseId.length > 0) {
      sample.expenseId = record.expenseId
    }
    samples.push(sample)
  }
  return samples
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
  roomCurrency: string,
  viewerMemberId?: string | null
): ExpenseDto {
  const redacted =
    expense.isPersonal &&
    (viewerMemberId == null || expense.paidById !== viewerMemberId)

  return {
    id: expense.id,
    title: redacted ? "Personal" : expense.title,
    amountCents: expense.amountCents,
    category: redacted ? null : expense.category,
    currency: expense.currency ?? roomCurrency,
    splitMode: expense.splitMode,
    isPersonal: expense.isPersonal,
    redacted,
    paidById: expense.paidById,
    paidByName: expense.paidBy.name,
    createdAt: expense.createdAt.toISOString(),
    shares: redacted
      ? [
          {
            memberId: expense.paidById,
            memberName: expense.paidBy.name,
            amountCents: expense.amountCents,
            weight: null,
          },
        ]
      : expense.shares.map((share) => ({
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
        orderBy: [{ sortIndex: "asc" }, { createdAt: "desc" }],
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

  return {
    id: room.id,
    code: room.code,
    name: room.name,
    currency: room.currency,
    currencies,
    fxRates: toFxRates(room.fxRates),
    fxAdjustmentBps: room.fxAdjustmentBps,
    fxCalibrationSamples: toFxCalibrationSamples(room.fxCalibrationSamples),
    createdAt: room.createdAt.toISOString(),
    members: room.members.map((member) => ({
      id: member.id,
      name: member.name,
    })),
    // Include others' personal expenses (redacted) so bank FX calibration can
    // use them; home/settle UIs hide redacted rows from the main lists.
    expenses: room.expenses.map((expense) =>
      expenseToDto(expense, room.currency, viewerMemberId)
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

    // Newest at top: list order is sortIndex asc, then createdAt desc.
    // Place new rows just above the current minimum sortIndex.
    const minSort = await prisma.expense.aggregate({
      where: { roomId: room.id },
      _min: { sortIndex: true },
    })
    const sortIndex =
      minSort._min.sortIndex == null ? 0 : minSort._min.sortIndex - 1

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
        sortIndex,
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

    return expenseToDto(expense, room.currency, data.paidById)
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

    return expenseToDto(expense, room.currency, data.paidById)
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

/** Persist a manual drag-to-reorder so every trip member sees the same order. */
export const reorderExpenses = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOrThrow(reorderExpensesSchema, data))
  .handler(async ({ data }): Promise<{ expenseIds: string[] }> => {
    limitWrites("reorder-expenses")
    const room = await prisma.room.findUnique({
      where: { code: data.code },
      select: { id: true },
    })
    if (!room) throw new Error("Trip not found")

    const roomExpenses = await prisma.expense.findMany({
      where: { roomId: room.id },
      select: { id: true, isPersonal: true },
    })
    const roomById = new Map(
      roomExpenses.map((expense) => [expense.id, expense])
    )
    const orderedIds = data.expenseIds

    if (new Set(orderedIds).size !== orderedIds.length) {
      throw new Error("Reorder list has duplicate expenses")
    }
    for (const id of orderedIds) {
      if (!roomById.has(id)) {
        throw new Error("Unknown expense in reorder")
      }
    }
    // Clients only see their own personal expenses; other members' personal
    // rows may be omitted. Every shared expense must still be present.
    for (const expense of roomExpenses) {
      if (!expense.isPersonal && !orderedIds.includes(expense.id)) {
        throw new Error("Reorder must include every shared expense")
      }
    }

    await prisma.$transaction(
      orderedIds.map((id, index) =>
        prisma.expense.update({
          where: { id },
          data: { sortIndex: index },
        })
      )
    )

    return { expenseIds: orderedIds }
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

export const calibrateRoomFx = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOrThrow(calibrateRoomFxSchema, data))
  .handler(async ({ data }): Promise<RoomDto> => {
    limitWrites("calibrate-room-fx")
    const room = await prisma.room.findUnique({
      where: { code: data.code },
      select: { id: true },
    })
    if (!room) throw new Error("Trip not found")

    const samples: FxCalibrationSample[] = data.samples.map((sample) => {
      const next: FxCalibrationSample = {
        appCents: sample.appCents,
        bankCents: sample.bankCents,
      }
      if (sample.expenseId) next.expenseId = sample.expenseId
      return next
    })
    const fxAdjustmentBps = computeFxAdjustmentBps(samples)

    await prisma.room.update({
      where: { id: room.id },
      data: {
        fxAdjustmentBps,
        fxCalibrationSamples: samples,
      },
    })

    const updated = await loadRoomByCode(data.code)
    if (!updated) throw new Error("Trip not found")
    return updated
  })
