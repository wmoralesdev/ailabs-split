import { parseRoomKind } from "@/lib/room-kind"

/** A dinner is one bill. Older dinners may hold more than one check; the first one is the bill. */
export function dinnerBill<T extends { createdAt: string }>(
  checks: readonly T[]
): T | null {
  let first: T | null = null
  for (const check of checks) {
    if (!first || check.createdAt < first.createdAt) first = check
  }
  return first
}

/** Host-only once a signed-in creator exists. Unsigned dinners stay open. */
export function dinnerCanEdit(room: {
  kind: string
  canEdit?: boolean
}): boolean {
  const kind = parseRoomKind(room.kind)
  switch (kind) {
    case "DINNER":
      return room.canEdit !== false
    case "TRIP":
    case "HOUSEHOLD":
      return true
    default: {
      const _never: never = kind
      throw new Error(`Unknown room kind: ${String(_never)}`)
    }
  }
}

/** Server-side: block dinner bill edits when someone else created the room. */
export function assertHostDinnerEdit(
  room: { kind: string; ownerUserId: string | null },
  userId: string | null
): void {
  const kind = parseRoomKind(room.kind)
  switch (kind) {
    case "DINNER":
      if (!room.ownerUserId) return
      if (userId !== room.ownerUserId) {
        throw new Error("Only the person who started this can edit it")
      }
      return
    case "TRIP":
    case "HOUSEHOLD":
      return
    default: {
      const _never: never = kind
      throw new Error(`Unknown room kind: ${String(_never)}`)
    }
  }
}
