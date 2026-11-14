import { createServerFn } from "@tanstack/react-start"
import { getRequestHeader } from "@tanstack/react-start/server"

import { getAuthUserId } from "@/server/auth-user.server"
import { getRoomByCode } from "@/server/rooms"
import type { RoomDto } from "@/server/rooms"
import { assertHostDinnerEdit } from "@/lib/dinner-bill"
import { resolveHouseViewer } from "@/lib/house-actor"
import { canManagePeople } from "@/lib/house-permissions"
import type { PayAccountType } from "@/lib/pay-details"
import { prisma } from "@/lib/prisma"
import { assertRateLimit } from "@/lib/rate-limit"
import { parseRoomKind } from "@/lib/room-kind"
import { savePayDetailsSchema } from "@/lib/schemas"

function clientIp(): string {
  const forwarded = getRequestHeader("x-forwarded-for")
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim()
    if (first) return first
  }
  return getRequestHeader("x-real-ip") ?? "unknown"
}

type RoomForPay = {
  kind: string
  ownerUserId: string | null
  members: Array<{
    id: string
    name: string
    userId: string | null
    isGuest: boolean
    joinedOn: Date | null
    leftOn: Date | null
  }>
}

function assertCanEditOthers(
  room: RoomForPay,
  authUserId: string | null,
  viewerMemberId: string | undefined
): void {
  const kind = parseRoomKind(room.kind)
  switch (kind) {
    case "DINNER":
    case "TRIP":
      assertHostDinnerEdit(room, authUserId)
      return
    case "HOUSEHOLD": {
      const viewer = resolveHouseViewer({
        ownerUserId: room.ownerUserId,
        members: room.members,
        authUserId,
        viewerMemberId,
      })
      if (!canManagePeople(viewer.role)) {
        throw new Error("Only housemates can add pay details")
      }
      return
    }
    default: {
      const _never: never = kind
      throw new Error(`Unknown room kind: ${String(_never)}`)
    }
  }
}

type PayFields = {
  account: string
  label: string | null
  accountType: PayAccountType | null
}

async function writeProfile(
  userId: string,
  { account, label, accountType }: PayFields
): Promise<void> {
  if (!account) {
    await prisma.payProfile.deleteMany({ where: { userId } })
    return
  }
  await prisma.payProfile.upsert({
    where: { userId },
    create: { userId, account, label, accountType },
    update: { account, label, accountType },
  })
}

/**
 * Save where to send someone money. A signed-in person keeps one number for
 * every room; someone added by name keeps it on their seat in this room.
 */
export const savePayDetails = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const result = savePayDetailsSchema.safeParse(data)
    if (!result.success) {
      throw new Error(result.error.issues[0]?.message ?? "Invalid input")
    }
    return result.data
  })
  .handler(async ({ data }): Promise<RoomDto> => {
    assertRateLimit(`write:ip:${clientIp()}:save-pay-details`, {
      limit: 30,
      windowMs: 60_000,
      label: "save-pay-details",
    })
    const authUserId = await getAuthUserId()
    const room = await prisma.room.findUnique({
      where: { code: data.code },
      include: { members: true },
    })
    if (!room) throw new Error("Room not found")
    const target = room.members.find((member) => member.id === data.memberId)
    if (!target) throw new Error("Person not found")

    const account = data.account
    const fields: PayFields = {
      account,
      label: account && data.label ? data.label : null,
      accountType: account ? (data.accountType ?? null) : null,
    }

    if (target.userId) {
      if (target.userId !== authUserId) {
        throw new Error(`Only ${target.name} can change their number`)
      }
      await writeProfile(target.userId, fields)
    } else {
      const self = data.viewerMemberId === target.id
      if (!self) assertCanEditOthers(room, authUserId, data.viewerMemberId)
      const linkSeat =
        self &&
        authUserId != null &&
        parseRoomKind(room.kind) !== "HOUSEHOLD" &&
        !room.members.some((member) => member.userId === authUserId)
      if (linkSeat) {
        await prisma.member.update({
          where: { id: target.id },
          data: {
            userId: authUserId,
            payAccount: null,
            payLabel: null,
            payAccountType: null,
          },
        })
        await writeProfile(authUserId, fields)
      } else {
        await prisma.member.update({
          where: { id: target.id },
          data: {
            payAccount: account || null,
            payLabel: fields.label,
            payAccountType: fields.accountType,
          },
        })
      }
    }

    const loaded = await getRoomByCode({
      data: {
        code: data.code,
        ...(data.viewerMemberId ? { viewerMemberId: data.viewerMemberId } : {}),
      },
    })
    if (!loaded) throw new Error("Room not found")
    return loaded
  })
