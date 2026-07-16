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
  joinRoomSchema,
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
  currency: string
  splitMode: string
  paidById: string
  paidByName: string
  createdAt: string
  shares: ExpenseShareDto[]
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

async function loadRoomByCode(code: string): Promise<RoomDto | null> {
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
    createdAt: room.createdAt.toISOString(),
    members: room.members.map((member) => ({
      id: member.id,
      name: member.name,
    })),
    expenses: room.expenses.map((expense) => ({
      id: expense.id,
      title: expense.title,
      amountCents: expense.amountCents,
      currency: expense.currency ?? room.currency,
      splitMode: expense.splitMode,
      paidById: expense.paidById,
      paidByName: expense.paidBy.name,
      createdAt: expense.createdAt.toISOString(),
      shares: expense.shares.map((share) => ({
        memberId: share.memberId,
        memberName: share.member.name,
        amountCents: share.amountCents,
        weight: share.weight ?? null,
      })),
    })),
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
  .validator((data: unknown) =>
    parseOrThrow(joinRoomSchema.pick({ code: true }), data)
  )
  .handler(async ({ data }): Promise<RoomDto | null> => {
    return await loadRoomByCode(data.code)
  })

export const joinRoom = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOrThrow(joinRoomSchema, data))
  .handler(
    async ({ data }): Promise<{ room: RoomDto; memberId: string }> => {
      limitWrites("join-room")
      const existing = await loadRoomByCode(data.code)
      if (!existing) {
        throw new Error("Trip not found")
      }

      const match = existing.members.find(
        (member) =>
          member.name.toLowerCase() === data.memberName.toLowerCase()
      )
      if (match) {
        return { room: existing, memberId: match.id }
      }

      await prisma.member.create({
        data: {
          roomId: existing.id,
          name: data.memberName,
        },
      })

      const room = await loadRoomByCode(data.code)
      if (!room) throw new Error("Trip not found")
      const created = room.members.find(
        (member) =>
          member.name.toLowerCase() === data.memberName.toLowerCase()
      )
      if (!created) throw new Error("Could not claim member")
      return { room, memberId: created.id }
    }
  )

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

    const currency =
      data.currency && room.currencies.includes(data.currency)
        ? data.currency
        : (data.currency ?? room.currency)

    let shares: Array<{ memberId: string; amountCents: number; weight: number | null }>

    if (data.splitMode === "PARTS") {
      const parts = partsSplitCents(
        data.amountCents,
        data.splits.map((split) => ({
          memberId: split.memberId,
          weight: split.weight ?? 0,
        }))
      )
      shares = parts.map((part) => ({
        memberId: part.memberId,
        amountCents: part.amountCents,
        weight: part.weight,
      }))
    } else if (data.splitMode === "AMOUNT") {
      const sum = data.splits.reduce(
        (total, split) => total + (split.amountCents ?? 0),
        0
      )
      if (sum !== data.amountCents) {
        throw new Error("Custom amounts must sum to the expense total")
      }
      shares = data.splits.map((split) => ({
        memberId: split.memberId,
        amountCents: split.amountCents ?? 0,
        weight: null,
      }))
    } else {
      shares = equalSplitCents(
        data.amountCents,
        data.splits.map((split) => split.memberId)
      ).map((share) => ({ ...share, weight: null }))
    }

    const expense = await prisma.expense.create({
      data: {
        roomId: room.id,
        title: data.title,
        amountCents: data.amountCents,
        currency,
        splitMode: data.splitMode,
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

    return {
      id: expense.id,
      title: expense.title,
      amountCents: expense.amountCents,
      currency: expense.currency ?? room.currency,
      splitMode: expense.splitMode,
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
  })
