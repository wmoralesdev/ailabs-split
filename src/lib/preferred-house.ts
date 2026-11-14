import { parseRoomKind } from "@/lib/room-kind"

export function householdRooms<T extends { kind: string }>(
  rooms: readonly T[]
): T[] {
  return rooms.filter((room) => parseRoomKind(room.kind) === "HOUSEHOLD")
}

/** The house this device already uses, else the first in `houses`. */
export function pickPreferredHouse<T extends { code: string }>(
  houses: readonly T[],
  recentCodes: readonly string[]
): T | undefined {
  if (houses.length === 0) return undefined
  const byCode = new Map(
    houses.map((house) => [house.code.trim().toUpperCase(), house])
  )
  for (const code of recentCodes) {
    const match = byCode.get(code.trim().toUpperCase())
    if (match) return match
  }
  return houses[0]
}
