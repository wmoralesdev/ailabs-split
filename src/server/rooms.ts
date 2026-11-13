import { createServerFn } from "@tanstack/react-start"
import { getRequestHeader } from "@tanstack/react-start/server"
import type { ZodType } from "zod"

import { getAuthUserId } from "@/server/auth-user.server"
import { assertHostDinnerEdit } from "@/lib/dinner-bill"
import { emptyCheckPayload, unassignMemberFromItems } from "@/lib/dinner-split"
import { buildExpenseShares } from "@/lib/expense-shares"
import {
  encodePaymentProof,
  paymentProofBytesFromPayload,
} from "@/lib/payment-proof"
import { prisma } from "@/lib/prisma"
import { assertRateLimit } from "@/lib/rate-limit"
import { generateRoomCode } from "@/lib/room-code"
import {
  HOUSE_SCREENS_MESSAGE,
  assertNotHousehold,
  parseRoomKind,
} from "@/lib/room-kind"
import type { RoomKind } from "@/lib/room-kind"
import {
  addExpenseSchema,
  addRoomMembersSchema,
  calibrateRoomFxSchema,
  checkPayloadSchema,
  claimMemberSchema,
  createRoomSchema,
  deleteExpenseSchema,
  deleteRoomSchema,
  deleteSettlementSchema,
  deleteSettlementsSchema,
  getRoomByCodeSchema,
  getSettlementProofSchema,
  hideRoomSchema,
  joinRoomSchema,
  recordSettlementSchema,
  recordSettlementsSchema,
  removeRoomMemberSchema,
  renameRoomMemberSchema,
  renameRoomSchema,
  reorderExpensesSchema,
  updateExpenseSchema,
} from "@/lib/schemas"
import type { CheckPayloadInput } from "@/lib/schemas"
import {
  buildHouseState,
  mapRecurringOccurrence,
  mapRecurringTemplate,
} from "@/lib/house-actor"
import { houseNetFromRows } from "@/lib/house-ledger"
import { isoDateFromUtc } from "@/lib/house-month"
import type { HouseStateDto } from "@/lib/house-types"
import { computeFxAdjustmentBps } from "@/lib/settle"
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
  periodMonth: string | null
  paidOn: string | null
  createdByMemberId: string | null
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
  hasProof: boolean
  createdByMemberId: string | null
}

export type RecordedSettlementDto = SettlementDto & { code: string }

export type SettlementProofDto = {
  mimeType: string
  base64: string
}

export type CheckDto = {
  id: string
  merchant: string
  currency: string
  paidById: string
  paidByName: string
  status: "DRAFT" | "CONFIRMED"
  isPrecuenta: boolean
  expenseId: string | null
  payload: CheckPayloadInput
  createdAt: string
  updatedAt: string
}

export type OwnedRoomDto = {
  code: string
  name: string
  kind: RoomKind
  createdAt: string
  owned: boolean
  currency?: string
  /** HOUSEHOLD: viewer's net cents. Omitted when they have no seat. */
  balanceCents?: number
}

export type RoomDto = {
  id: string
  code: string
  name: string
  kind: RoomKind
  /** True when the signed-in viewer created this room. */
  owned: boolean
  /**
   * Dinner: the signed-in creator, or anyone if the room has no owner yet.
   * Trips stay editable by anyone with the code.
   */
  canEdit: boolean
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
  checks: CheckDto[]
  house?: HouseStateDto
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

function viewerAccess(
  room: { kind: string; ownerUserId: string | null },
  viewerUserId: string | null
): { owned: boolean; canEdit: boolean } {
  const owned = Boolean(
    room.ownerUserId && viewerUserId && room.ownerUserId === viewerUserId
  )
  const kind = parseRoomKind(room.kind)
  switch (kind) {
    case "DINNER":
      return { owned, canEdit: !room.ownerUserId || owned }
    case "TRIP":
    case "HOUSEHOLD":
      return { owned, canEdit: true }
    default: {
      const _never: never = kind
      throw new Error(`Unknown room kind: ${String(_never)}`)
    }
  }
}

function refuseHouseholdThenDinner(kind: string, dinnerMessage: string): void {
  const parsed = parseRoomKind(kind)
  switch (parsed) {
    case "HOUSEHOLD":
      throw new Error(HOUSE_SCREENS_MESSAGE)
    case "DINNER":
      throw new Error(dinnerMessage)
    case "TRIP":
      return
    default: {
      const _never: never = parsed
      throw new Error(`Unknown room kind: ${String(_never)}`)
    }
  }
}

async function assertCanRenameRoom(
  room: { kind: string; ownerUserId: string | null },
  userId: string | null
): Promise<void> {
  const kind = parseRoomKind(room.kind)
  switch (kind) {
    case "DINNER":
      assertHostDinnerEdit(room, userId)
      return
    case "HOUSEHOLD":
      if (!room.ownerUserId || userId !== room.ownerUserId) {
        throw new Error("Only the person who started this can edit it")
      }
      return
    case "TRIP":
      return
    default: {
      const _never: never = kind
      throw new Error(`Unknown room kind: ${String(_never)}`)
    }
  }
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
    periodMonth?: string | null
    paidOn?: Date | null
    createdByMemberId?: string | null
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
    periodMonth: expense.periodMonth ?? null,
    paidOn: expense.paidOn ? isoDateFromUtc(expense.paidOn) : null,
    createdByMemberId: expense.createdByMemberId ?? null,
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

export function checkToDto(check: {
  id: string
  merchant: string
  currency: string
  paidById: string
  paidBy: { name: string }
  status: string
  isPrecuenta: boolean
  expenseId: string | null
  payload: unknown
  createdAt: Date
  updatedAt: Date
}): CheckDto {
  const parsed = checkPayloadSchema.safeParse(check.payload)
  return {
    id: check.id,
    merchant: check.merchant,
    currency: check.currency,
    paidById: check.paidById,
    paidByName: check.paidBy.name,
    status: check.status === "CONFIRMED" ? "CONFIRMED" : "DRAFT",
    isPrecuenta: check.isPrecuenta,
    expenseId: check.expenseId,
    payload: parsed.success ? parsed.data : emptyCheckPayload(),
    createdAt: check.createdAt.toISOString(),
    updatedAt: check.updatedAt.toISOString(),
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
  proofMimeType?: string | null
  createdByMemberId?: string | null
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
    hasProof: Boolean(settlement.proofMimeType),
    createdByMemberId: settlement.createdByMemberId ?? null,
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
        select: {
          id: true,
          fromMemberId: true,
          toMemberId: true,
          amountCents: true,
          currency: true,
          createdAt: true,
          proofMimeType: true,
          createdByMemberId: true,
          fromMember: { select: { name: true } },
          toMember: { select: { name: true } },
        },
      },
      checks: {
        orderBy: { createdAt: "desc" },
        include: { paidBy: true },
      },
      templates: {
        include: {
          shares: true,
          occurrences: true,
        },
      },
    },
  })

  if (!room) return null

  const viewerUserId = await getAuthUserId()
  const access = viewerAccess(room, viewerUserId)
  const currencies =
    room.currencies.length > 0
      ? Array.from(new Set([room.currency, ...room.currencies]))
      : [room.currency]
  const kind = parseRoomKind(room.kind)
  const house =
    kind === "HOUSEHOLD"
      ? buildHouseState({
          ownerUserId: room.ownerUserId,
          members: room.members,
          templates: room.templates.map(mapRecurringTemplate),
          occurrences: room.templates.flatMap((template) =>
            template.occurrences.map(mapRecurringOccurrence)
          ),
          authUserId: viewerUserId,
          viewerMemberId,
        })
      : undefined

  return {
    id: room.id,
    code: room.code,
    name: room.name,
    kind,
    owned: access.owned,
    canEdit: access.canEdit,
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
    checks: room.checks.map(checkToDto),
    ...(house ? { house } : {}),
  }
}

export const createRoom = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOrThrow(createRoomSchema, data))
  .handler(async ({ data }): Promise<RoomDto> => {
    limitWrites("create-room")
    const kind = parseRoomKind(data.kind)
    let currencies: string[]
    let fxRates: Record<string, number>
    switch (kind) {
      case "HOUSEHOLD":
        throw new Error(HOUSE_SCREENS_MESSAGE)
      case "DINNER":
        currencies = [data.currency]
        fxRates = {}
        break
      case "TRIP":
        currencies = Array.from(new Set([data.currency, ...data.currencies]))
        fxRates = data.fxRates ?? {}
        break
      default: {
        const _never: never = kind
        throw new Error(`Unknown room kind: ${String(_never)}`)
      }
    }
    const ownerUserId = await getAuthUserId()

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const code = generateRoomCode(7)
      try {
        const room = await prisma.room.create({
          data: {
            code,
            name: data.name,
            kind,
            currency: data.currency,
            currencies,
            fxRates,
            ...(ownerUserId ? { ownerUserId } : {}),
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
    assertNotHousehold(existing.kind)

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

/** Add people to a room by name. Used by dinner hosts before guests join. */
export const addRoomMembers = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOrThrow(addRoomMembersSchema, data))
  .handler(async ({ data }): Promise<RoomDto> => {
    limitWrites("add-members")
    const room = await prisma.room.findUnique({
      where: { code: data.code },
      include: { members: true },
    })
    if (!room) throw new Error("Room not found")
    assertNotHousehold(room.kind)
    assertHostDinnerEdit(room, await getAuthUserId())

    const existing = new Set(
      room.members.map((member) => member.name.toLowerCase())
    )
    const toCreate: string[] = []
    for (const name of data.names) {
      const key = name.toLowerCase()
      if (existing.has(key)) continue
      existing.add(key)
      toCreate.push(name)
    }
    if (toCreate.length > 0) {
      await prisma.member.createMany({
        data: toCreate.map((name) => ({ roomId: room.id, name })),
      })
    }

    const loaded = await loadRoomByCode(data.code)
    if (!loaded) throw new Error("Room not found")
    return loaded
  })

/** Rename a guest on the dinner bill. Join-by-code still matches the new name. */
export const renameRoomMember = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOrThrow(renameRoomMemberSchema, data))
  .handler(async ({ data }): Promise<RoomDto> => {
    limitWrites("rename-member")
    const room = await prisma.room.findUnique({
      where: { code: data.code },
      include: { members: true },
    })
    if (!room) throw new Error("Room not found")
    assertNotHousehold(room.kind)
    assertHostDinnerEdit(room, await getAuthUserId())
    const member = room.members.find((entry) => entry.id === data.memberId)
    if (!member) throw new Error("Person not found")
    const taken = room.members.some(
      (entry) =>
        entry.id !== member.id &&
        entry.name.toLowerCase() === data.name.toLowerCase()
    )
    if (taken) throw new Error("Someone already has that name")
    if (member.name !== data.name) {
      await prisma.member.update({
        where: { id: member.id },
        data: { name: data.name },
      })
    }
    const loaded = await loadRoomByCode(data.code)
    if (!loaded) throw new Error("Room not found")
    return loaded
  })

/**
 * Take a guest off the dinner. Draft items they had go back to unassigned.
 * Confirmed bills, payers, and open payments are blocked with a reason.
 */
export const removeRoomMember = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOrThrow(removeRoomMemberSchema, data))
  .handler(async ({ data }): Promise<RoomDto> => {
    limitWrites("remove-member")
    const room = await prisma.room.findUnique({
      where: { code: data.code },
      include: {
        members: true,
        checks: true,
        expenses: { include: { shares: true } },
        settlements: true,
      },
    })
    if (!room) throw new Error("Room not found")
    assertNotHousehold(room.kind)
    assertHostDinnerEdit(room, await getAuthUserId())
    if (room.members.length <= 1) {
      throw new Error("Keep at least one person")
    }
    const member = room.members.find((entry) => entry.id === data.memberId)
    if (!member) throw new Error("Person not found")

    const paidCheck = room.checks.some((check) => check.paidById === member.id)
    const paidExpense = room.expenses.some(
      (expense) => expense.paidById === member.id
    )
    if (paidCheck || paidExpense) {
      throw new Error("This person paid. Pick someone else first.")
    }

    const onExpense = room.expenses.some((expense) =>
      expense.shares.some((share) => share.memberId === member.id)
    )
    if (onExpense) {
      throw new Error("Move the bill back to draft first")
    }

    const onSettlement = room.settlements.some(
      (settlement) =>
        settlement.fromMemberId === member.id ||
        settlement.toMemberId === member.id
    )
    if (onSettlement) {
      throw new Error("Undo their payments first")
    }

    await prisma.$transaction(async (tx) => {
      for (const check of room.checks) {
        const parsed = checkPayloadSchema.safeParse(check.payload)
        if (!parsed.success) continue
        const items = unassignMemberFromItems(parsed.data.items, member.id)
        if (JSON.stringify(items) === JSON.stringify(parsed.data.items)) {
          continue
        }
        const payload: CheckPayloadInput = { ...parsed.data, items }
        await tx.check.update({
          where: { id: check.id },
          data: { payload },
        })
      }
      await tx.member.delete({ where: { id: member.id } })
    })

    const loaded = await loadRoomByCode(data.code)
    if (!loaded) throw new Error("Room not found")
    return loaded
  })

/** Dinner title: host only once a creator exists. Scan-first create still names it from the ticket. */
export const renameRoom = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOrThrow(renameRoomSchema, data))
  .handler(async ({ data }): Promise<RoomDto> => {
    limitWrites("rename-room")
    const room = await prisma.room.findUnique({
      where: { code: data.code },
      select: { id: true, kind: true, ownerUserId: true },
    })
    if (!room) throw new Error("Room not found")
    await assertCanRenameRoom(room, await getAuthUserId())
    await prisma.room.update({
      where: { code: data.code },
      data: { name: data.name },
    })
    if (parseRoomKind(room.kind) === "DINNER") {
      await prisma.check.updateMany({
        where: { roomId: room.id },
        data: { merchant: data.name },
      })
    }
    const loaded = await loadRoomByCode(data.code)
    if (!loaded) throw new Error("Room not found")
    return loaded
  })

export const claimMemberById = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOrThrow(claimMemberSchema, data))
  .handler(async ({ data }): Promise<{ memberId: string; name: string }> => {
    const room = await prisma.room.findUnique({
      where: { code: data.code },
      include: { members: true },
    })
    if (!room) throw new Error("Trip not found")
    assertNotHousehold(room.kind)
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
    refuseHouseholdThenDinner(room.kind, "Charges are added from the bill")

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
    refuseHouseholdThenDinner(room.kind, "Charges are edited from the bill")

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
      select: { id: true, kind: true },
    })
    if (!room) throw new Error("Trip not found")
    refuseHouseholdThenDinner(room.kind, "Charges are deleted from the bill")

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
      select: { id: true, kind: true },
    })
    if (!room) throw new Error("Trip not found")
    refuseHouseholdThenDinner(room.kind, "Bills do not reorder trip expenses")

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
    assertNotHousehold(room.kind)
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

    let proof:
      { proofBytes: Uint8Array<ArrayBuffer>; proofMimeType: string } | undefined
    if (data.proof) {
      const stored = paymentProofBytesFromPayload(data.proof)
      proof = {
        proofBytes: new Uint8Array(stored.bytes),
        proofMimeType: stored.mimeType,
      }
    }

    const settlement = await prisma.settlement.create({
      data: {
        roomId: room.id,
        fromMemberId: data.fromMemberId,
        toMemberId: data.toMemberId,
        amountCents: data.amountCents,
        currency,
        ...proof,
      },
      include: {
        fromMember: true,
        toMember: true,
      },
    })

    return settlementToDto(settlement)
  })

export const recordSettlements = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOrThrow(recordSettlementsSchema, data))
  .handler(async ({ data }): Promise<RecordedSettlementDto[]> => {
    limitWrites("record-settlement")
    let proof:
      { proofBytes: Uint8Array<ArrayBuffer>; proofMimeType: string } | undefined
    if (data.proof) {
      const stored = paymentProofBytesFromPayload(data.proof)
      proof = {
        proofBytes: new Uint8Array(stored.bytes),
        proofMimeType: stored.mimeType,
      }
    }

    return await prisma.$transaction(async (tx) => {
      const created: RecordedSettlementDto[] = []
      for (const item of data.items) {
        if (item.fromMemberId === item.toMemberId) {
          throw new Error("Settlement needs two different members")
        }
        const room = await tx.room.findUnique({
          where: { code: item.code },
          include: { members: true },
        })
        if (!room) throw new Error("Trip not found")
        assertNotHousehold(room.kind)
        const memberIds = new Set(room.members.map((member) => member.id))
        if (
          !memberIds.has(item.fromMemberId) ||
          !memberIds.has(item.toMemberId)
        ) {
          throw new Error("Settlement member is not in this trip")
        }
        const allowedCurrencies =
          room.currencies.length > 0
            ? Array.from(new Set([room.currency, ...room.currencies]))
            : [room.currency]
        const currency =
          item.currency && allowedCurrencies.includes(item.currency)
            ? item.currency
            : room.currency
        const copiedProof = proof
          ? {
              proofBytes: new Uint8Array(proof.proofBytes),
              proofMimeType: proof.proofMimeType,
            }
          : undefined
        const settlement = await tx.settlement.create({
          data: {
            roomId: room.id,
            fromMemberId: item.fromMemberId,
            toMemberId: item.toMemberId,
            amountCents: item.amountCents,
            currency,
            ...copiedProof,
          },
          include: {
            fromMember: true,
            toMember: true,
          },
        })
        created.push({ ...settlementToDto(settlement), code: room.code })
      }
      return created
    })
  })

export const getSettlementProof = createServerFn({ method: "GET" })
  .validator((data: unknown) => parseOrThrow(getSettlementProofSchema, data))
  .handler(async ({ data }): Promise<SettlementProofDto | null> => {
    assertRateLimit(`proof:ip:${clientIp()}`, {
      limit: 60,
      windowMs: 60_000,
      label: "payment photos",
    })
    const room = await prisma.room.findUnique({
      where: { code: data.code },
      select: { id: true },
    })
    if (!room) throw new Error("Trip not found")

    const settlement = await prisma.settlement.findFirst({
      where: { id: data.settlementId, roomId: room.id },
      select: { proofBytes: true, proofMimeType: true },
    })
    if (!settlement?.proofBytes || settlement.proofBytes.length === 0) {
      return null
    }

    const mimeType = settlement.proofMimeType ?? "image/jpeg"
    return {
      mimeType,
      base64: encodePaymentProof(settlement.proofBytes),
    }
  })

export const deleteSettlement = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOrThrow(deleteSettlementSchema, data))
  .handler(async ({ data }): Promise<{ settlementId: string }> => {
    limitWrites("delete-settlement")
    const room = await prisma.room.findUnique({
      where: { code: data.code },
      select: { id: true, kind: true },
    })
    if (!room) throw new Error("Trip not found")
    assertNotHousehold(room.kind)

    const existing = await prisma.settlement.findFirst({
      where: { id: data.settlementId, roomId: room.id },
      select: { id: true },
    })
    if (!existing) throw new Error("Settlement not found")

    await prisma.settlement.delete({ where: { id: data.settlementId } })
    return { settlementId: data.settlementId }
  })

export const deleteSettlements = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOrThrow(deleteSettlementsSchema, data))
  .handler(
    async ({
      data,
    }): Promise<{ items: Array<{ code: string; settlementId: string }> }> => {
      limitWrites("delete-settlement")
      await prisma.$transaction(async (tx) => {
        for (const item of data.items) {
          const room = await tx.room.findUnique({
            where: { code: item.code },
            select: { id: true, kind: true },
          })
          if (!room) throw new Error("Trip not found")
          assertNotHousehold(room.kind)
          const existing = await tx.settlement.findFirst({
            where: { id: item.settlementId, roomId: room.id },
            select: { id: true },
          })
          if (!existing) throw new Error("Settlement not found")
          await tx.settlement.delete({ where: { id: item.settlementId } })
        }
      })
      return { items: data.items }
    }
  )

export const calibrateRoomFx = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOrThrow(calibrateRoomFxSchema, data))
  .handler(async ({ data }): Promise<RoomDto> => {
    limitWrites("calibrate-room-fx")
    const room = await prisma.room.findUnique({
      where: { code: data.code },
      select: { id: true, kind: true },
    })
    if (!room) throw new Error("Trip not found")
    assertNotHousehold(room.kind)

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

export const listMyRooms = createServerFn({ method: "GET" }).handler(
  async (): Promise<OwnedRoomDto[]> => {
    const userId = await getAuthUserId()
    if (!userId) return []
    const rooms = await prisma.room.findMany({
      where: {
        AND: [
          {
            OR: [
              { ownerUserId: userId },
              {
                kind: "HOUSEHOLD",
                members: { some: { userId } },
              },
            ],
          },
          { hides: { none: { userId } } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: {
        id: true,
        code: true,
        name: true,
        kind: true,
        createdAt: true,
        currency: true,
        ownerUserId: true,
      },
    })
    const householdIds = rooms
      .filter((room) => parseRoomKind(room.kind) === "HOUSEHOLD")
      .map((room) => room.id)
    const ledgers =
      householdIds.length === 0
        ? []
        : await prisma.room.findMany({
            where: { id: { in: householdIds } },
            select: {
              id: true,
              members: {
                select: { id: true, name: true, userId: true },
              },
              expenses: {
                select: {
                  paidById: true,
                  isPersonal: true,
                  shares: {
                    select: { memberId: true, amountCents: true },
                  },
                },
              },
              settlements: {
                select: {
                  fromMemberId: true,
                  toMemberId: true,
                  amountCents: true,
                },
              },
            },
          })
    const ledgerById = new Map(ledgers.map((row) => [row.id, row]))
    return rooms.map((room) => {
      const kind = parseRoomKind(room.kind)
      const owned = room.ownerUserId === userId
      const base = {
        code: room.code,
        name: room.name,
        kind,
        createdAt: room.createdAt.toISOString(),
        owned,
      }
      if (kind !== "HOUSEHOLD") return base
      const ledger = ledgerById.get(room.id)
      const member = ledger?.members.find((row) => row.userId === userId)
      if (!ledger || !member) {
        return { ...base, currency: room.currency }
      }
      return {
        ...base,
        currency: room.currency,
        balanceCents: houseNetFromRows(
          ledger.members,
          ledger.expenses,
          ledger.settlements,
          member.id
        ),
      }
    })
  }
)

export const listHiddenRoomCodes = createServerFn({ method: "GET" }).handler(
  async (): Promise<string[]> => {
    const userId = await getAuthUserId()
    if (!userId) return []
    const rows = await prisma.roomHide.findMany({
      where: { userId },
      select: { room: { select: { code: true } } },
    })
    return rows.map((row) => row.room.code)
  }
)

export const hideRoom = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOrThrow(hideRoomSchema, data))
  .handler(async ({ data }): Promise<{ code: string }> => {
    limitWrites("hide-room")
    const userId = await getAuthUserId()
    if (!userId) {
      throw new Error("Sign in to hide this on every device")
    }
    const room = await prisma.room.findUnique({ where: { code: data.code } })
    if (!room) throw new Error("Trip not found")
    if (room.ownerUserId && room.ownerUserId === userId) {
      throw new Error("You started this. Delete it instead of hiding it.")
    }
    await prisma.roomHide.upsert({
      where: { userId_roomId: { userId, roomId: room.id } },
      create: { userId, roomId: room.id },
      update: {},
    })
    return { code: room.code }
  })

export const deleteRoom = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOrThrow(deleteRoomSchema, data))
  .handler(async ({ data }): Promise<{ code: string }> => {
    limitWrites("delete-room")
    const userId = await getAuthUserId()
    if (!userId) {
      throw new Error("Sign in to delete this")
    }
    const room = await prisma.room.findUnique({ where: { code: data.code } })
    if (!room) throw new Error("Trip not found")
    if (room.ownerUserId !== userId) {
      throw new Error("Only the person who started this can delete it")
    }

    await prisma.$transaction(async (tx) => {
      await tx.check.deleteMany({ where: { roomId: room.id } })
      await tx.expense.deleteMany({ where: { roomId: room.id } })
      await tx.settlement.deleteMany({ where: { roomId: room.id } })
      await tx.recurringTemplate.deleteMany({ where: { roomId: room.id } })
      await tx.member.deleteMany({ where: { roomId: room.id } })
      await tx.room.delete({ where: { id: room.id } })
    })
    return { code: room.code }
  })
