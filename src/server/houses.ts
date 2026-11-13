import { createServerFn } from "@tanstack/react-start"
import { getRequestHeader } from "@tanstack/react-start/server"
import type { ZodType } from "zod"

import {
  alreadyInHouseMessage,
  housemateNameTakenMessage,
  resolveHouseViewer,
  spotClaimedMessage,
} from "@/lib/house-actor"
import { buildExpenseShares } from "@/lib/expense-shares"
import { memberHasHouseLedger } from "@/lib/house-ledger"
import {
  addMonths,
  formatMonth,
  isMovedOutOn,
  isoDateFromUtc,
  isoDateToUtc,
  localIsoDate,
  monthEnd,
  monthKey,
  monthStart,
  stayOverlapsMonth,
} from "@/lib/house-month"
import { paymentProofBytesFromPayload } from "@/lib/payment-proof"
import {
  canAddCharge,
  canConfirmDue,
  canCreateTemplate,
  canDeletePayment,
  canEditCharge,
  canEditTemplate,
  canManagePeople,
  canRecordPayment,
  canSetMemberDates,
  canTransferHouse,
  canUndoSkip,
  guestsCantAddChargesMessage,
  hasChargesMoveOutMessage,
  onlyAuthorOrOwnerCanEditMessage,
  transferBeforeMoveOutMessage,
} from "@/lib/house-permissions"
import { prisma } from "@/lib/prisma"
import { assertRateLimit } from "@/lib/rate-limit"
import { generateRoomCode } from "@/lib/room-code"
import { parseRoomKind } from "@/lib/room-kind"
import {
  addHouseChargeSchema,
  addHousePeopleSchema,
  archiveRecurringTemplateSchema,
  claimHouseGuestSchema,
  claimHousemateSchema,
  confirmDueChargeSchema,
  createHouseSchema,
  deleteHouseChargeSchema,
  deleteHousePaymentSchema,
  joinHouseAsGuestSchema,
  joinHouseAsHousemateSchema,
  recordHousePaymentSchema,
  saveRecurringTemplateSchema,
  skipDueChargeSchema,
  undoSkipDueSchema,
  removeHouseMemberSchema,
  renameHouseMemberSchema,
  setHouseMemberKindSchema,
  setHouseMemberStaySchema,
  transferHouseSchema,
  updateHouseChargeSchema,
} from "@/lib/schemas"
import { getAuthUserId } from "@/server/auth-user.server"
import { getRoomByCode } from "@/server/rooms"
import type { RoomDto } from "@/server/rooms"

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

function sameName(
  members: Array<{ name: string }>,
  name: string
): { name: string } | undefined {
  const needle = name.trim().toLowerCase()
  return members.find((member) => member.name.toLowerCase() === needle)
}

async function loadHouseRow(code: string) {
  const room = await prisma.room.findUnique({
    where: { code },
    include: {
      members: true,
      expenses: { include: { shares: { select: { memberId: true } } } },
      settlements: {
        select: { fromMemberId: true, toMemberId: true },
      },
      templates: { include: { shares: true } },
    },
  })
  if (!room || parseRoomKind(room.kind) !== "HOUSEHOLD") {
    throw new Error("House not found")
  }
  return room
}

async function resolveHouseContext(code: string, viewerMemberId?: string) {
  const house = await loadHouseRow(code)
  const authUserId = await getAuthUserId()
  const viewer = resolveHouseViewer({
    ownerUserId: house.ownerUserId,
    members: house.members,
    authUserId,
    viewerMemberId,
  })
  const actor = viewer.memberId
    ? (house.members.find((member) => member.id === viewer.memberId) ?? null)
    : null
  return { house, viewer, actor, authUserId }
}

async function reloadHouse(code: string, viewerMemberId?: string) {
  const room = await getRoomByCode({
    data: { code, ...(viewerMemberId ? { viewerMemberId } : {}) },
  })
  if (!room) throw new Error("House not found")
  return room
}

function onlyHousematesMessage(): string {
  return "Only housemates can add people"
}

function uniqueNames(names: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const name of names) {
    const trimmed = name.trim()
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(trimmed)
  }
  return out
}

export const createHouse = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOrThrow(createHouseSchema, data))
  .handler(async ({ data }): Promise<RoomDto> => {
    limitWrites("create-house")
    const userId = await getAuthUserId()
    if (!userId) {
      throw new Error("Sign in to start a house")
    }

    const creatorName = data.creatorName.trim()
    const housemates = uniqueNames(data.housemateNames).filter(
      (name) => name.toLowerCase() !== creatorName.toLowerCase()
    )
    const joinedOn = isoDateToUtc(data.joinedOn ?? localIsoDate())

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const code = generateRoomCode(7)
      try {
        const room = await prisma.room.create({
          data: {
            code,
            name: data.name,
            kind: "HOUSEHOLD",
            currency: data.currency,
            currencies: [data.currency],
            fxRates: {},
            ownerUserId: userId,
            members: {
              create: [
                {
                  name: creatorName,
                  userId,
                  isGuest: false,
                  joinedOn,
                },
                ...housemates.map((name) => ({
                  name,
                  isGuest: false,
                  joinedOn,
                })),
              ],
            },
          },
        })
        const loaded = await getRoomByCode({ data: { code: room.code } })
        if (!loaded) throw new Error("Failed to load house")
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

export const claimHousemate = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOrThrow(claimHousemateSchema, data))
  .handler(async ({ data }): Promise<{ room: RoomDto; memberId: string }> => {
    limitWrites("claim-housemate")
    const userId = await getAuthUserId()
    if (!userId) {
      throw new Error("Sign in to claim this")
    }
    const house = await loadHouseRow(data.code)
    const existing = house.members.find((member) => member.userId === userId)
    if (existing) {
      throw new Error(alreadyInHouseMessage(existing.name))
    }
    const seat = house.members.find((member) => member.id === data.memberId)
    if (!seat || seat.isGuest) {
      throw new Error("House not found")
    }
    if (seat.userId) {
      throw new Error(spotClaimedMessage())
    }

    try {
      await prisma.member.update({
        where: { id: seat.id },
        data: { userId },
      })
    } catch (error) {
      const isUnique =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code: string }).code === "P2002"
      if (isUnique) {
        throw new Error(spotClaimedMessage())
      }
      throw error
    }

    const room = await getRoomByCode({
      data: { code: house.code, viewerMemberId: seat.id },
    })
    if (!room) throw new Error("House not found")
    return { room, memberId: seat.id }
  })

export const joinHouseAsHousemate = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOrThrow(joinHouseAsHousemateSchema, data))
  .handler(async ({ data }): Promise<{ room: RoomDto; memberId: string }> => {
    limitWrites("join-house-housemate")
    const userId = await getAuthUserId()
    if (!userId) {
      throw new Error("Sign in to claim this")
    }
    const house = await loadHouseRow(data.code)
    const existing = house.members.find((member) => member.userId === userId)
    if (existing) {
      throw new Error(alreadyInHouseMessage(existing.name))
    }
    if (sameName(house.members, data.name)) {
      throw new Error("That name is already in this house")
    }

    const created = await prisma.member.create({
      data: {
        roomId: house.id,
        name: data.name.trim(),
        userId,
        isGuest: false,
        joinedOn: isoDateToUtc(localIsoDate()),
      },
    })
    const room = await getRoomByCode({
      data: { code: house.code, viewerMemberId: created.id },
    })
    if (!room) throw new Error("House not found")
    return { room, memberId: created.id }
  })

export const joinHouseAsGuest = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOrThrow(joinHouseAsGuestSchema, data))
  .handler(async ({ data }): Promise<{ room: RoomDto; memberId: string }> => {
    limitWrites("join-house-guest")
    const house = await loadHouseRow(data.code)
    const match = sameName(house.members, data.name)
    const matched = match
      ? house.members.find((member) => member.name === match.name)
      : undefined
    if (matched && !matched.isGuest) {
      throw new Error(housemateNameTakenMessage())
    }
    if (matched?.isGuest && !matched.userId) {
      const room = await getRoomByCode({
        data: { code: house.code, viewerMemberId: matched.id },
      })
      if (!room) throw new Error("House not found")
      return { room, memberId: matched.id }
    }

    const created = await prisma.member.create({
      data: {
        roomId: house.id,
        name: data.name.trim(),
        isGuest: true,
        joinedOn: isoDateToUtc(localIsoDate()),
      },
    })
    const room = await getRoomByCode({
      data: { code: house.code, viewerMemberId: created.id },
    })
    if (!room) throw new Error("House not found")
    return { room, memberId: created.id }
  })

export const claimHouseGuest = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOrThrow(claimHouseGuestSchema, data))
  .handler(async ({ data }): Promise<{ room: RoomDto; memberId: string }> => {
    limitWrites("claim-house-guest")
    const house = await loadHouseRow(data.code)
    const seat = house.members.find((member) => member.id === data.memberId)
    if (!seat || !seat.isGuest || seat.userId) {
      throw new Error("House not found")
    }
    const room = await getRoomByCode({
      data: { code: house.code, viewerMemberId: seat.id },
    })
    if (!room) throw new Error("House not found")
    return { room, memberId: seat.id }
  })

export const addHousePeople = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOrThrow(addHousePeopleSchema, data))
  .handler(async ({ data }): Promise<RoomDto> => {
    limitWrites("add-house-people")
    const { house, viewer } = await resolveHouseContext(
      data.code,
      data.viewerMemberId
    )
    if (!canManagePeople(viewer.role)) {
      throw new Error(onlyHousematesMessage())
    }
    const names = uniqueNames(data.names)
    if (names.length === 0) throw new Error("Add a name")
    for (const name of names) {
      if (sameName(house.members, name)) {
        throw new Error("That name is already in this house")
      }
    }
    const joinedOn = isoDateToUtc(localIsoDate())
    await prisma.member.createMany({
      data: names.map((name) => ({
        roomId: house.id,
        name,
        isGuest: data.isGuest,
        joinedOn,
      })),
    })
    return reloadHouse(house.code, data.viewerMemberId)
  })

export const renameHouseMember = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOrThrow(renameHouseMemberSchema, data))
  .handler(async ({ data }): Promise<RoomDto> => {
    limitWrites("rename-house-member")
    const { house, viewer, actor } = await resolveHouseContext(
      data.code,
      data.viewerMemberId
    )
    const target = house.members.find((member) => member.id === data.memberId)
    if (!target) throw new Error("Person not found")
    const self = actor?.id === target.id
    if (!self && !canManagePeople(viewer.role)) {
      throw new Error(onlyHousematesMessage())
    }
    if (!self && target.userId) {
      throw new Error("They've claimed this spot.")
    }
    if (
      house.members.some(
        (member) =>
          member.id !== target.id &&
          member.name.toLowerCase() === data.name.toLowerCase()
      )
    ) {
      throw new Error("That name is already in this house")
    }
    if (target.name !== data.name) {
      await prisma.member.update({
        where: { id: target.id },
        data: { name: data.name },
      })
    }
    return reloadHouse(house.code, data.viewerMemberId)
  })

export const setHouseMemberStay = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOrThrow(setHouseMemberStaySchema, data))
  .handler(async ({ data }): Promise<RoomDto> => {
    limitWrites("set-house-stay")
    const { house, viewer, actor } = await resolveHouseContext(
      data.code,
      data.viewerMemberId
    )
    const target = house.members.find((member) => member.id === data.memberId)
    if (!target) throw new Error("Person not found")
    if (!canSetMemberDates(viewer.role, actor?.id ?? null, target.id)) {
      throw new Error(onlyHousematesMessage())
    }
    const nextJoined =
      data.joinedOn === undefined
        ? target.joinedOn
        : data.joinedOn
          ? isoDateToUtc(data.joinedOn)
          : null
    const nextLeft =
      data.leftOn === undefined
        ? target.leftOn
        : data.leftOn
          ? isoDateToUtc(data.leftOn)
          : null
    const previousLeft = target.leftOn
      ? target.leftOn.toISOString().slice(0, 10)
      : null
    const leaving =
      data.leftOn !== undefined &&
      data.leftOn != null &&
      data.leftOn !== previousLeft
    const targetIsOwner = Boolean(
      house.ownerUserId && target.userId && target.userId === house.ownerUserId
    )
    if (leaving && targetIsOwner) {
      throw new Error(transferBeforeMoveOutMessage())
    }
    if (nextJoined && nextLeft && nextLeft < nextJoined) {
      throw new Error("Moved out can't be before they moved in")
    }
    await prisma.member.update({
      where: { id: target.id },
      data: {
        ...(data.joinedOn !== undefined ? { joinedOn: nextJoined } : {}),
        ...(data.leftOn !== undefined ? { leftOn: nextLeft } : {}),
      },
    })
    return reloadHouse(house.code, data.viewerMemberId)
  })

export const setHouseMemberKind = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOrThrow(setHouseMemberKindSchema, data))
  .handler(async ({ data }): Promise<RoomDto> => {
    limitWrites("set-house-kind")
    const { house, viewer } = await resolveHouseContext(
      data.code,
      data.viewerMemberId
    )
    if (!canManagePeople(viewer.role)) {
      throw new Error(onlyHousematesMessage())
    }
    const target = house.members.find((member) => member.id === data.memberId)
    if (!target) throw new Error("Person not found")
    if (target.userId && data.isGuest) {
      throw new Error("They've claimed this spot.")
    }
    const targetIsOwner = Boolean(
      house.ownerUserId && target.userId && target.userId === house.ownerUserId
    )
    if (targetIsOwner) {
      throw new Error(transferBeforeMoveOutMessage())
    }
    await prisma.member.update({
      where: { id: target.id },
      data: { isGuest: data.isGuest },
    })
    return reloadHouse(house.code, data.viewerMemberId)
  })

export const removeHouseMember = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOrThrow(removeHouseMemberSchema, data))
  .handler(async ({ data }): Promise<RoomDto> => {
    limitWrites("remove-house-member")
    const { house, viewer, actor } = await resolveHouseContext(
      data.code,
      data.viewerMemberId
    )
    if (!canManagePeople(viewer.role)) {
      throw new Error(onlyHousematesMessage())
    }
    const target = house.members.find((member) => member.id === data.memberId)
    if (!target) throw new Error("Person not found")
    if (actor?.id === target.id) {
      throw new Error("That's you")
    }
    const targetIsOwner = Boolean(
      house.ownerUserId && target.userId && target.userId === house.ownerUserId
    )
    if (targetIsOwner) {
      throw new Error(transferBeforeMoveOutMessage())
    }
    const onLedger = memberHasHouseLedger(target.id, {
      expenses: house.expenses,
      settlements: house.settlements,
      templates: house.templates,
    })
    if (onLedger || target.userId) {
      throw new Error(hasChargesMoveOutMessage(target.name))
    }
    await prisma.member.delete({ where: { id: target.id } })
    return reloadHouse(house.code, data.viewerMemberId)
  })

export const transferHouse = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOrThrow(transferHouseSchema, data))
  .handler(async ({ data }): Promise<RoomDto> => {
    limitWrites("transfer-house")
    const { house, viewer } = await resolveHouseContext(
      data.code,
      data.viewerMemberId
    )
    if (!canTransferHouse(viewer.role)) {
      throw new Error("Only the person who started this can transfer it")
    }
    const target = house.members.find((member) => member.id === data.toMemberId)
    if (!target?.userId || target.isGuest) {
      throw new Error("Pick a housemate who has claimed their spot")
    }
    if (isMovedOutOn(target.leftOn, localIsoDate())) {
      throw new Error("Pick a housemate who has claimed their spot")
    }
    await prisma.room.update({
      where: { id: house.id },
      data: { ownerUserId: target.userId },
    })
    return reloadHouse(house.code, data.viewerMemberId)
  })

function assertChargeStay(
  members: Array<{
    id: string
    name: string
    joinedOn: Date | null
    leftOn: Date | null
  }>,
  paidById: string,
  splits: Array<{ memberId: string }>,
  periodMonth: string
) {
  const byId = new Map(members.map((member) => [member.id, member]))
  const involved = new Set([paidById, ...splits.map((split) => split.memberId)])
  for (const memberId of involved) {
    const member = byId.get(memberId)
    if (!member) throw new Error("Person not found")
    const joinedOn = member.joinedOn ? isoDateFromUtc(member.joinedOn) : null
    const leftOn = member.leftOn ? isoDateFromUtc(member.leftOn) : null
    if (leftOn && leftOn < monthStart(periodMonth)) {
      throw new Error(
        `${member.name} moved out before ${formatMonth(periodMonth)}`
      )
    }
    if (
      !stayOverlapsMonth({ joinedOn, leftOn }, periodMonth) &&
      joinedOn &&
      joinedOn > monthEnd(periodMonth)
    ) {
      throw new Error(
        `${member.name} wasn't in the house in ${formatMonth(periodMonth)}`
      )
    }
  }
}

export const addHouseCharge = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOrThrow(addHouseChargeSchema, data))
  .handler(async ({ data }): Promise<RoomDto> => {
    limitWrites("add-house-charge")
    const { house, viewer, actor } = await resolveHouseContext(
      data.code,
      data.viewerMemberId
    )
    if (!actor || !canAddCharge(viewer.role)) {
      throw new Error(guestsCantAddChargesMessage())
    }
    assertChargeStay(
      house.members,
      data.paidById,
      data.splits,
      data.periodMonth
    )
    const { splitMode, shares } = buildExpenseShares({
      paidById: data.paidById,
      amountCents: data.amountCents,
      splitMode: data.splitMode,
      isPersonal: false,
      splits: data.splits,
    })
    const minSort = await prisma.expense.aggregate({
      where: { roomId: house.id },
      _min: { sortIndex: true },
    })
    const sortIndex =
      minSort._min.sortIndex == null ? 0 : minSort._min.sortIndex - 1
    await prisma.expense.create({
      data: {
        roomId: house.id,
        title: data.title,
        amountCents: data.amountCents,
        category: data.category,
        currency: house.currency,
        splitMode,
        isPersonal: false,
        paidById: data.paidById,
        sortIndex,
        periodMonth: data.periodMonth,
        paidOn: isoDateToUtc(data.paidOn),
        createdByMemberId: actor.id,
        shares: {
          create: shares.map((share) => ({
            memberId: share.memberId,
            amountCents: share.amountCents,
            weight: share.weight,
          })),
        },
      },
    })
    return reloadHouse(house.code, data.viewerMemberId)
  })

export const updateHouseCharge = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOrThrow(updateHouseChargeSchema, data))
  .handler(async ({ data }): Promise<RoomDto> => {
    limitWrites("update-house-charge")
    const { house, viewer, actor } = await resolveHouseContext(
      data.code,
      data.viewerMemberId
    )
    const existing = house.expenses.find((row) => row.id === data.expenseId)
    if (!existing) throw new Error("Charge not found")
    const isAuthor = Boolean(actor && existing.createdByMemberId === actor.id)
    if (!actor || !canEditCharge(viewer.role, isAuthor)) {
      const author =
        house.members.find((member) => member.id === existing.createdByMemberId)
          ?.name ?? "the author"
      throw new Error(onlyAuthorOrOwnerCanEditMessage(author))
    }
    assertChargeStay(
      house.members,
      data.paidById,
      data.splits,
      data.periodMonth
    )
    const { splitMode, shares } = buildExpenseShares({
      paidById: data.paidById,
      amountCents: data.amountCents,
      splitMode: data.splitMode,
      isPersonal: false,
      splits: data.splits,
    })
    await prisma.$transaction(async (tx) => {
      await tx.expenseShare.deleteMany({ where: { expenseId: existing.id } })
      await tx.expense.update({
        where: { id: existing.id },
        data: {
          title: data.title,
          amountCents: data.amountCents,
          category: data.category,
          currency: house.currency,
          splitMode,
          isPersonal: false,
          paidById: data.paidById,
          periodMonth: data.periodMonth,
          paidOn: isoDateToUtc(data.paidOn),
          shares: {
            create: shares.map((share) => ({
              memberId: share.memberId,
              amountCents: share.amountCents,
              weight: share.weight,
            })),
          },
        },
      })
    })
    return reloadHouse(house.code, data.viewerMemberId)
  })

export const deleteHouseCharge = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOrThrow(deleteHouseChargeSchema, data))
  .handler(async ({ data }): Promise<RoomDto> => {
    limitWrites("delete-house-charge")
    const { house, viewer, actor } = await resolveHouseContext(
      data.code,
      data.viewerMemberId
    )
    const existing = house.expenses.find((row) => row.id === data.expenseId)
    if (!existing) throw new Error("Charge not found")
    const isAuthor = Boolean(actor && existing.createdByMemberId === actor.id)
    if (!actor || !canEditCharge(viewer.role, isAuthor)) {
      const author =
        house.members.find((member) => member.id === existing.createdByMemberId)
          ?.name ?? "the author"
      throw new Error(onlyAuthorOrOwnerCanEditMessage(author))
    }
    await prisma.expense.delete({ where: { id: existing.id } })
    return reloadHouse(house.code, data.viewerMemberId)
  })

export const recordHousePayment = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOrThrow(recordHousePaymentSchema, data))
  .handler(async ({ data }): Promise<RoomDto> => {
    limitWrites("record-house-payment")
    const { house, viewer, actor } = await resolveHouseContext(
      data.code,
      data.viewerMemberId
    )
    if (
      !actor ||
      !canRecordPayment(
        viewer.role,
        actor.id,
        data.fromMemberId,
        data.toMemberId
      )
    ) {
      throw new Error("You can only record a payment you're part of")
    }
    if (data.fromMemberId === data.toMemberId) {
      throw new Error("Pick two different people")
    }
    const memberIds = new Set(house.members.map((member) => member.id))
    if (!memberIds.has(data.fromMemberId) || !memberIds.has(data.toMemberId)) {
      throw new Error("Person not found")
    }
    let proof:
      { proofBytes: Uint8Array<ArrayBuffer>; proofMimeType: string } | undefined
    if (data.proof) {
      const stored = paymentProofBytesFromPayload(data.proof)
      proof = {
        proofBytes: new Uint8Array(stored.bytes),
        proofMimeType: stored.mimeType,
      }
    }
    await prisma.settlement.create({
      data: {
        roomId: house.id,
        fromMemberId: data.fromMemberId,
        toMemberId: data.toMemberId,
        amountCents: data.amountCents,
        currency: house.currency,
        createdByMemberId: actor.id,
        ...proof,
      },
    })
    return reloadHouse(house.code, data.viewerMemberId)
  })

export const deleteHousePayment = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOrThrow(deleteHousePaymentSchema, data))
  .handler(async ({ data }): Promise<RoomDto> => {
    limitWrites("delete-house-payment")
    const { house, viewer, actor } = await resolveHouseContext(
      data.code,
      data.viewerMemberId
    )
    const existing = await prisma.settlement.findFirst({
      where: { id: data.settlementId, roomId: house.id },
      select: {
        id: true,
        createdByMemberId: true,
        toMemberId: true,
      },
    })
    if (!existing) throw new Error("Payment not found")
    if (
      !actor ||
      !canDeletePayment(
        viewer.role,
        actor.id,
        existing.createdByMemberId,
        existing.toMemberId
      )
    ) {
      throw new Error("You can't undo this payment")
    }
    await prisma.settlement.delete({ where: { id: existing.id } })
    return reloadHouse(house.code, data.viewerMemberId)
  })

function isUniqueConstraint(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "P2002"
  )
}

function assertPeriodAllowed(startMonth: string, periodMonth: string) {
  const latest = addMonths(monthKey(), 1)
  if (periodMonth < startMonth || periodMonth > latest) {
    throw new Error(`That month isn't due yet`)
  }
}

export const saveRecurringTemplate = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOrThrow(saveRecurringTemplateSchema, data))
  .handler(async ({ data }): Promise<RoomDto> => {
    limitWrites("save-recurring-template")
    const { house, viewer, actor } = await resolveHouseContext(
      data.code,
      data.viewerMemberId
    )
    const existing = data.templateId
      ? house.templates.find((row) => row.id === data.templateId)
      : null
    if (data.templateId && !existing) throw new Error("Template not found")
    const isAuthor = Boolean(
      actor && existing && existing.createdByMemberId === actor.id
    )
    if (!actor) {
      throw new Error(guestsCantAddChargesMessage())
    }
    if (existing) {
      if (!canEditTemplate(viewer.role, isAuthor)) {
        throw new Error("Only the author or the owner can edit this")
      }
    } else if (!canCreateTemplate(viewer.role)) {
      throw new Error(guestsCantAddChargesMessage())
    }
    assertChargeStay(house.members, data.paidById, data.splits, data.startMonth)
    const amountCents = data.kind === "VARIABLE" ? null : data.amountCents
    const shareData = data.splits.map((split) => ({
      memberId: split.memberId,
      weight: data.splitMode === "PARTS" ? (split.weight ?? 0) : null,
      amountCents:
        data.splitMode === "AMOUNT" ? (split.amountCents ?? 0) : null,
    }))
    if (existing) {
      await prisma.$transaction(async (tx) => {
        await tx.recurringShare.deleteMany({
          where: { templateId: existing.id },
        })
        await tx.recurringTemplate.update({
          where: { id: existing.id },
          data: {
            title: data.title,
            category: data.category,
            kind: data.kind,
            amountCents,
            dueDay: data.dueDay,
            paidById: data.paidById,
            splitMode: data.splitMode,
            startMonth: data.startMonth,
            shares: { create: shareData },
          },
        })
      })
    } else {
      await prisma.recurringTemplate.create({
        data: {
          roomId: house.id,
          title: data.title,
          category: data.category,
          kind: data.kind,
          amountCents,
          dueDay: data.dueDay,
          paidById: data.paidById,
          splitMode: data.splitMode,
          startMonth: data.startMonth,
          createdByMemberId: actor.id,
          shares: { create: shareData },
        },
      })
    }
    return reloadHouse(house.code, data.viewerMemberId)
  })

export const archiveRecurringTemplate = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    parseOrThrow(archiveRecurringTemplateSchema, data)
  )
  .handler(async ({ data }): Promise<RoomDto> => {
    limitWrites("archive-recurring-template")
    const { house, viewer, actor } = await resolveHouseContext(
      data.code,
      data.viewerMemberId
    )
    const existing = house.templates.find((row) => row.id === data.templateId)
    if (!existing) throw new Error("Template not found")
    const isAuthor = Boolean(actor && existing.createdByMemberId === actor.id)
    if (!actor || !canEditTemplate(viewer.role, isAuthor)) {
      throw new Error("Only the author or the owner can edit this")
    }
    await prisma.recurringTemplate.update({
      where: { id: existing.id },
      data: { archivedAt: new Date() },
    })
    return reloadHouse(house.code, data.viewerMemberId)
  })

export const confirmDueCharge = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOrThrow(confirmDueChargeSchema, data))
  .handler(async ({ data }): Promise<RoomDto> => {
    limitWrites("confirm-due-charge")
    const { house, viewer, actor } = await resolveHouseContext(
      data.code,
      data.viewerMemberId
    )
    if (!actor || !canConfirmDue(viewer.role)) {
      throw new Error(guestsCantAddChargesMessage())
    }
    const template = house.templates.find((row) => row.id === data.templateId)
    if (!template || template.archivedAt) {
      throw new Error("Template not found")
    }
    assertPeriodAllowed(template.startMonth, data.periodMonth)
    const title = data.title?.trim() || template.title
    const category = data.category ?? template.category
    const paidById = data.paidById ?? template.paidById
    const paidOn = data.paidOn ?? localIsoDate()
    const splitMode = data.splitMode ?? template.splitMode
    const amountCents =
      data.amountCents ??
      (template.kind === "VARIABLE" ? null : template.amountCents)
    if (amountCents == null || amountCents <= 0) {
      throw new Error("Enter a valid amount")
    }
    const splits =
      data.splits ??
      template.shares
        .filter((share) => {
          const member = house.members.find((row) => row.id === share.memberId)
          if (!member) return false
          const joinedOn = member.joinedOn
            ? isoDateFromUtc(member.joinedOn)
            : null
          const leftOn = member.leftOn ? isoDateFromUtc(member.leftOn) : null
          return stayOverlapsMonth({ joinedOn, leftOn }, data.periodMonth)
        })
        .map((share) => ({
          memberId: share.memberId,
          weight: share.weight ?? undefined,
          amountCents: share.amountCents ?? undefined,
        }))
    if (splits.length === 0) {
      throw new Error("Pick at least one person")
    }
    assertChargeStay(house.members, paidById, splits, data.periodMonth)
    const built = buildExpenseShares({
      paidById,
      amountCents,
      splitMode:
        splitMode === "PARTS" || splitMode === "AMOUNT" ? splitMode : "EQUAL",
      isPersonal: false,
      splits,
    })
    const minSort = await prisma.expense.aggregate({
      where: { roomId: house.id },
      _min: { sortIndex: true },
    })
    const sortIndex =
      minSort._min.sortIndex == null ? 0 : minSort._min.sortIndex - 1
    try {
      await prisma.$transaction(async (tx) => {
        const expense = await tx.expense.create({
          data: {
            roomId: house.id,
            title,
            amountCents,
            category,
            currency: house.currency,
            splitMode: built.splitMode,
            isPersonal: false,
            paidById,
            sortIndex,
            periodMonth: data.periodMonth,
            paidOn: isoDateToUtc(paidOn),
            createdByMemberId: actor.id,
            shares: {
              create: built.shares.map((share) => ({
                memberId: share.memberId,
                amountCents: share.amountCents,
                weight: share.weight,
              })),
            },
          },
        })
        await tx.recurringOccurrence.create({
          data: {
            templateId: template.id,
            periodMonth: data.periodMonth,
            status: "CONFIRMED",
            expenseId: expense.id,
            createdByMemberId: actor.id,
          },
        })
      })
    } catch (error) {
      if (!isUniqueConstraint(error)) throw error
    }
    return reloadHouse(house.code, data.viewerMemberId)
  })

export const skipDueCharge = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOrThrow(skipDueChargeSchema, data))
  .handler(async ({ data }): Promise<RoomDto> => {
    limitWrites("skip-due-charge")
    const { house, viewer, actor } = await resolveHouseContext(
      data.code,
      data.viewerMemberId
    )
    if (!actor || !canConfirmDue(viewer.role)) {
      throw new Error(guestsCantAddChargesMessage())
    }
    const template = house.templates.find((row) => row.id === data.templateId)
    if (!template || template.archivedAt) {
      throw new Error("Template not found")
    }
    assertPeriodAllowed(template.startMonth, data.periodMonth)
    try {
      await prisma.recurringOccurrence.create({
        data: {
          templateId: template.id,
          periodMonth: data.periodMonth,
          status: "SKIPPED",
          createdByMemberId: actor.id,
        },
      })
    } catch (error) {
      if (!isUniqueConstraint(error)) throw error
    }
    return reloadHouse(house.code, data.viewerMemberId)
  })

export const undoSkipDue = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOrThrow(undoSkipDueSchema, data))
  .handler(async ({ data }): Promise<RoomDto> => {
    limitWrites("undo-skip-due")
    const { house, viewer, actor } = await resolveHouseContext(
      data.code,
      data.viewerMemberId
    )
    if (!actor || !canUndoSkip(viewer.role)) {
      throw new Error(guestsCantAddChargesMessage())
    }
    await prisma.recurringOccurrence.deleteMany({
      where: {
        templateId: data.templateId,
        periodMonth: data.periodMonth,
        status: "SKIPPED",
        template: { roomId: house.id },
      },
    })
    return reloadHouse(house.code, data.viewerMemberId)
  })
