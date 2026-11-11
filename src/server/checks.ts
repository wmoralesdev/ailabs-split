import { createServerFn } from "@tanstack/react-start"
import { getRequestHeader } from "@tanstack/react-start/server"
import type { ZodType } from "zod"

import { computeDinnerSplit, expenseSharesFromDinner } from "@/lib/dinner-split"
import { prisma } from "@/lib/prisma"
import { assertRateLimit } from "@/lib/rate-limit"
import {
  checkPayloadSchema,
  confirmCheckSchema,
  deleteCheckSchema,
  revertCheckSchema,
  upsertCheckSchema,
} from "@/lib/schemas"
import { getAuthUserId } from "@/server/auth-user.server"
import { checkToDto } from "@/server/rooms"
import type { CheckDto } from "@/server/rooms"

function parseOrThrow<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data)
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? "Invalid input")
  }
  return result.data
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

async function requireDinnerRoom(code: string) {
  const room = await prisma.room.findUnique({
    where: { code },
    include: { members: true },
  })
  if (!room) throw new Error("Room not found")
  if (room.kind !== "DINNER") {
    throw new Error("Checks are only for dinners")
  }
  return room
}

async function loadCheckDto(checkId: string): Promise<CheckDto> {
  const check = await prisma.check.findUnique({
    where: { id: checkId },
    include: { paidBy: true },
  })
  if (!check) throw new Error("Check not found")
  return checkToDto(check)
}

async function materializeExpense(input: {
  roomId: string
  roomCurrency: string
  merchant: string
  amountCents: number
  paidById: string
  expenseId: string | null
  shares: Array<{ memberId: string; amountCents: number }>
}): Promise<string> {
  const title = input.merchant.slice(0, 80) || "Dinner check"

  if (input.expenseId) {
    const expense = await prisma.$transaction(async (tx) => {
      await tx.expenseShare.deleteMany({
        where: { expenseId: input.expenseId! },
      })
      return await tx.expense.update({
        where: { id: input.expenseId! },
        data: {
          title,
          amountCents: input.amountCents,
          category: "Food",
          currency: input.roomCurrency,
          splitMode: "AMOUNT",
          isPersonal: false,
          paidById: input.paidById,
          shares: {
            create: input.shares.map((share) => ({
              memberId: share.memberId,
              amountCents: share.amountCents,
              weight: null,
            })),
          },
        },
        select: { id: true },
      })
    })
    return expense.id
  }

  const minSort = await prisma.expense.aggregate({
    where: { roomId: input.roomId },
    _min: { sortIndex: true },
  })
  const sortIndex =
    minSort._min.sortIndex == null ? 0 : minSort._min.sortIndex - 1

  const expense = await prisma.expense.create({
    data: {
      roomId: input.roomId,
      title,
      amountCents: input.amountCents,
      category: "Food",
      currency: input.roomCurrency,
      splitMode: "AMOUNT",
      isPersonal: false,
      paidById: input.paidById,
      sortIndex,
      shares: {
        create: input.shares.map((share) => ({
          memberId: share.memberId,
          amountCents: share.amountCents,
          weight: null,
        })),
      },
    },
    select: { id: true },
  })
  return expense.id
}

export const upsertCheck = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOrThrow(upsertCheckSchema, data))
  .handler(async ({ data }): Promise<CheckDto> => {
    limitWrites("upsert-check")
    const room = await requireDinnerRoom(data.code)
    const memberIds = new Set(room.members.map((member) => member.id))
    if (!memberIds.has(data.paidById)) {
      throw new Error("Payer is not in this dinner")
    }

    // A dinner is one bill: a second create lands on the bill that is already there.
    const checkId =
      data.checkId ??
      (
        await prisma.check.findFirst({
          where: { roomId: room.id },
          orderBy: { createdAt: "asc" },
          select: { id: true },
        })
      )?.id

    if (checkId) {
      const existing = await prisma.check.findFirst({
        where: { id: checkId, roomId: room.id },
      })
      if (!existing) throw new Error("Check not found")

      if (existing.status === "CONFIRMED") {
        const split = computeDinnerSplit({
          items: data.payload.items,
          adjustments: data.payload.adjustments,
          tip: data.payload.tip,
          notedTotalCents: data.payload.notedTotalCents,
        })
        if (!split.canConfirm) {
          throw new Error(
            split.confirmBlockReason ?? "Assign every item before saving"
          )
        }
        const shares = expenseSharesFromDinner(split)
        const expenseId = await materializeExpense({
          roomId: room.id,
          roomCurrency: room.currency,
          merchant: data.merchant,
          amountCents: split.totalCents,
          paidById: data.paidById,
          expenseId: existing.expenseId,
          shares,
        })
        await prisma.check.update({
          where: { id: existing.id },
          data: {
            merchant: data.merchant,
            paidById: data.paidById,
            isPrecuenta: data.isPrecuenta,
            payload: data.payload,
            expenseId,
            status: "CONFIRMED",
          },
        })
        return await loadCheckDto(existing.id)
      }

      await prisma.check.update({
        where: { id: existing.id },
        data: {
          merchant: data.merchant,
          paidById: data.paidById,
          isPrecuenta: data.isPrecuenta,
          payload: data.payload,
        },
      })
      return await loadCheckDto(existing.id)
    }

    const check = await prisma.check.create({
      data: {
        roomId: room.id,
        merchant: data.merchant,
        currency: room.currency,
        paidById: data.paidById,
        isPrecuenta: data.isPrecuenta,
        payload: data.payload,
        status: "DRAFT",
      },
    })
    return await loadCheckDto(check.id)
  })

export const confirmCheck = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOrThrow(confirmCheckSchema, data))
  .handler(async ({ data }): Promise<CheckDto> => {
    limitWrites("confirm-check")
    const room = await requireDinnerRoom(data.code)
    const check = await prisma.check.findFirst({
      where: { id: data.checkId, roomId: room.id },
    })
    if (!check) throw new Error("Check not found")

    const parsedResult = checkPayloadSchema.safeParse(check.payload)
    if (!parsedResult.success) {
      throw new Error("Check data is invalid")
    }
    const parsed = parsedResult.data
    const split = computeDinnerSplit({
      items: parsed.items,
      adjustments: parsed.adjustments,
      tip: parsed.tip,
      notedTotalCents: parsed.notedTotalCents,
    })
    if (!split.canConfirm) {
      throw new Error(
        split.confirmBlockReason ?? "Assign every item before confirming"
      )
    }
    if (split.totalCents <= 0) {
      throw new Error("Check total must be greater than zero")
    }

    const shares = expenseSharesFromDinner(split)
    if (shares.length === 0) {
      throw new Error("Nothing to split")
    }
    const memberIds = new Set(room.members.map((member) => member.id))
    for (const share of shares) {
      if (!memberIds.has(share.memberId)) {
        throw new Error("Share member is not in this dinner")
      }
    }
    if (!memberIds.has(check.paidById)) {
      throw new Error("Payer is not in this dinner")
    }

    const expenseId = await materializeExpense({
      roomId: room.id,
      roomCurrency: room.currency,
      merchant: check.merchant,
      amountCents: split.totalCents,
      paidById: check.paidById,
      expenseId: check.expenseId,
      shares,
    })

    await prisma.check.update({
      where: { id: check.id },
      data: { status: "CONFIRMED", expenseId },
    })
    return await loadCheckDto(check.id)
  })

export const revertCheck = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOrThrow(revertCheckSchema, data))
  .handler(async ({ data }): Promise<CheckDto> => {
    limitWrites("revert-check")
    const room = await requireDinnerRoom(data.code)
    const check = await prisma.check.findFirst({
      where: { id: data.checkId, roomId: room.id },
    })
    if (!check) throw new Error("Check not found")

    const expenseId = check.expenseId
    await prisma.check.update({
      where: { id: check.id },
      data: { status: "DRAFT", expenseId: null },
    })
    if (expenseId) {
      await prisma.expense.delete({ where: { id: expenseId } }).catch(() => {
        // Already gone
      })
    }
    return await loadCheckDto(check.id)
  })

export const deleteCheck = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOrThrow(deleteCheckSchema, data))
  .handler(async ({ data }): Promise<{ checkId: string }> => {
    limitWrites("delete-check")
    const room = await requireDinnerRoom(data.code)
    const check = await prisma.check.findFirst({
      where: { id: data.checkId, roomId: room.id },
    })
    if (!check) throw new Error("Check not found")
    const userId = await getAuthUserId()
    if (!room.ownerUserId || room.ownerUserId !== userId) {
      throw new Error("Only the person who started this bill can delete it")
    }

    const expenseId = check.expenseId
    await prisma.check.delete({ where: { id: check.id } })
    if (expenseId) {
      await prisma.expense.delete({ where: { id: expenseId } }).catch(() => {
        // Already gone
      })
    }
    return { checkId: data.checkId }
  })
