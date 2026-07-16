import { createServerFn } from "@tanstack/react-start"
import { getRequestHeader } from "@tanstack/react-start/server"

import { prisma } from "@/lib/prisma"
import { assertRateLimit } from "@/lib/rate-limit"
import { generateRoomCode, normalizeRoomCode } from "@/lib/room-code"
import { equalSplitCents } from "@/lib/settle"

export type RoomMemberDto = {
  id: string
  name: string
}

export type ExpenseShareDto = {
  memberId: string
  memberName: string
  amountCents: number
}

export type ExpenseDto = {
  id: string
  title: string
  amountCents: number
  paidById: string
  paidByName: string
  createdAt: string
  shares: ExpenseShareDto[]
}

export type RoomDto = {
  id: string
  code: string
  name: string
  currency: string
  createdAt: string
  members: RoomMemberDto[]
  expenses: ExpenseDto[]
}

function asString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Invalid ${field}`)
  }
  return value.trim()
}

function asStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`Invalid ${field}`)
  }
  return value.map((entry, index) => {
    if (typeof entry !== "string" || !entry.trim()) {
      throw new Error(`Invalid ${field}[${index}]`)
    }
    return entry.trim()
  })
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

  return {
    id: room.id,
    code: room.code,
    name: room.name,
    currency: room.currency,
    createdAt: room.createdAt.toISOString(),
    members: room.members.map((member) => ({
      id: member.id,
      name: member.name,
    })),
    expenses: room.expenses.map((expense) => ({
      id: expense.id,
      title: expense.title,
      amountCents: expense.amountCents,
      paidById: expense.paidById,
      paidByName: expense.paidBy.name,
      createdAt: expense.createdAt.toISOString(),
      shares: expense.shares.map((share) => ({
        memberId: share.memberId,
        memberName: share.member.name,
        amountCents: share.amountCents,
      })),
    })),
  }
}

export const createRoom = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    if (typeof data !== "object" || data === null) {
      throw new Error("Invalid payload")
    }
    const body = data as Record<string, unknown>
    const name = asString(body.name, "name")
    const currency = asString(body.currency, "currency").toUpperCase()
    const memberNames = asStringArray(body.memberNames, "memberNames")
    if (currency.length !== 3) {
      throw new Error("Currency must be a 3-letter ISO code")
    }
    if (memberNames.length < 2) {
      throw new Error("Add at least two members")
    }
    return { name, currency, memberNames }
  })
  .handler(async ({ data }): Promise<RoomDto> => {
    limitWrites("create-room")
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const code = generateRoomCode(7)
      try {
        const room = await prisma.room.create({
          data: {
            code,
            name: data.name,
            currency: data.currency,
            members: {
              create: data.memberNames.map((memberName) => ({
                name: memberName,
              })),
            },
          },
        })
        const loaded = await loadRoomByCode(room.code)
        if (!loaded) throw new Error("Failed to load room")
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
    throw new Error("Could not allocate a room code")
  })

export const getRoomByCode = createServerFn({ method: "GET" })
  .validator((data: unknown) => {
    if (typeof data !== "object" || data === null) {
      throw new Error("Invalid payload")
    }
    const code = normalizeRoomCode(asString((data as { code?: unknown }).code, "code"))
    if (code.length < 6 || code.length > 8) {
      throw new Error("Room code must be 6–8 characters")
    }
    return { code }
  })
  .handler(async ({ data }): Promise<RoomDto | null> => {
    return await loadRoomByCode(data.code)
  })

export const joinRoom = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    if (typeof data !== "object" || data === null) {
      throw new Error("Invalid payload")
    }
    const body = data as Record<string, unknown>
    const code = normalizeRoomCode(asString(body.code, "code"))
    const memberName = asString(body.memberName, "memberName")
    if (code.length < 6 || code.length > 8) {
      throw new Error("Room code must be 6–8 characters")
    }
    if (memberName.length > 40) {
      throw new Error("Name is too long")
    }
    return { code, memberName }
  })
  .handler(
    async ({
      data,
    }): Promise<{ room: RoomDto; memberId: string }> => {
      limitWrites("join-room")
      const existing = await loadRoomByCode(data.code)
      if (!existing) {
        throw new Error("Room not found")
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
      if (!room) throw new Error("Room not found")
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
  .validator((data: unknown) => {
    if (typeof data !== "object" || data === null) {
      throw new Error("Invalid payload")
    }
    const body = data as Record<string, unknown>
    const code = normalizeRoomCode(asString(body.code, "code"))
    const memberId = asString(body.memberId, "memberId")
    if (code.length < 6 || code.length > 8) {
      throw new Error("Room code must be 6–8 characters")
    }
    return { code, memberId }
  })
  .handler(async ({ data }): Promise<{ memberId: string; name: string }> => {
    const room = await prisma.room.findUnique({
      where: { code: data.code },
      include: { members: true },
    })
    if (!room) throw new Error("Room not found")
    const member = room.members.find((entry) => entry.id === data.memberId)
    if (!member) throw new Error("Member not found in this room")
    return { memberId: member.id, name: member.name }
  })


export const addExpense = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    if (typeof data !== "object" || data === null) {
      throw new Error("Invalid payload")
    }
    const body = data as Record<string, unknown>
    const code = normalizeRoomCode(asString(body.code, "code"))
    const title = asString(body.title, "title")
    const paidById = asString(body.paidById, "paidById")
    const amountCents = body.amountCents
    if (typeof amountCents !== "number" || !Number.isInteger(amountCents) || amountCents <= 0) {
      throw new Error("Amount must be a positive integer (cents)")
    }

    const shareMemberIds = asStringArray(body.shareMemberIds, "shareMemberIds")
    const customShares = body.customShares
    let shares: Array<{ memberId: string; amountCents: number }> | null = null

    if (customShares !== undefined && customShares !== null) {
      if (!Array.isArray(customShares) || customShares.length === 0) {
        throw new Error("Invalid customShares")
      }
      shares = customShares.map((entry, index) => {
        if (typeof entry !== "object" || entry === null) {
          throw new Error(`Invalid customShares[${index}]`)
        }
        const row = entry as Record<string, unknown>
        const memberId = asString(row.memberId, `customShares[${index}].memberId`)
        const shareAmount = row.amountCents
        if (
          typeof shareAmount !== "number" ||
          !Number.isInteger(shareAmount) ||
          shareAmount < 0
        ) {
          throw new Error(`Invalid customShares[${index}].amountCents`)
        }
        return { memberId, amountCents: shareAmount }
      })
      const sum = shares.reduce((total, share) => total + share.amountCents, 0)
      if (sum !== amountCents) {
        throw new Error("Custom shares must sum to the expense total")
      }
    }

    return {
      code,
      title,
      amountCents,
      paidById,
      shareMemberIds,
      shares,
    }
  })
  .handler(async ({ data }): Promise<ExpenseDto> => {
    limitWrites("add-expense")
    const room = await prisma.room.findUnique({
      where: { code: data.code },
      include: { members: true },
    })
    if (!room) throw new Error("Room not found")

    const memberIds = new Set(room.members.map((member) => member.id))
    if (!memberIds.has(data.paidById)) {
      throw new Error("Payer is not in this room")
    }
    for (const memberId of data.shareMemberIds) {
      if (!memberIds.has(memberId)) {
        throw new Error("Share member is not in this room")
      }
    }

    const shares =
      data.shares ?? equalSplitCents(data.amountCents, data.shareMemberIds)

    const expense = await prisma.expense.create({
      data: {
        roomId: room.id,
        title: data.title,
        amountCents: data.amountCents,
        paidById: data.paidById,
        shares: {
          create: shares.map((share) => ({
            memberId: share.memberId,
            amountCents: share.amountCents,
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
      paidById: expense.paidById,
      paidByName: expense.paidBy.name,
      createdAt: expense.createdAt.toISOString(),
      shares: expense.shares.map((share) => ({
        memberId: share.memberId,
        memberName: share.member.name,
        amountCents: share.amountCents,
      })),
    }
  })
